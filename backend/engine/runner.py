import os
import json
import importlib.util
from typing import Dict, Any, List
from engine.schema import WorkflowBlueprint

MODULES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "modules")


class EngineRunner:
    """Executes a WorkflowBlueprint by topologically sorting the DAG
    and running each module's `implementation.py` in order, passing
    a shared state dict between them."""

    def __init__(self, blueprint: WorkflowBlueprint):
        self.blueprint = blueprint
        self.state_store: Dict[str, Any] = {}
        self.execution_log: List[Dict[str, Any]] = []

    # ── DAG ordering ────────────────────────────────────────────

    def _build_execution_graph(self) -> List[str]:
        """Topological sort (Kahn's algorithm) over the blueprint DAG.
        Returns a list of node IDs in valid execution order."""
        in_degree: Dict[str, int] = {node.id: 0 for node in self.blueprint.nodes}
        adj_list: Dict[str, List[str]] = {node.id: [] for node in self.blueprint.nodes}

        for conn in self.blueprint.connections:
            if conn.from_node in adj_list and conn.to_node in in_degree:
                adj_list[conn.from_node].append(conn.to_node)
                in_degree[conn.to_node] += 1

        queue = [nid for nid, deg in in_degree.items() if deg == 0]
        execution_order: List[str] = []

        while queue:
            current = queue.pop(0)
            execution_order.append(current)
            for neighbor in adj_list.get(current, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        # Detect cycles: if we didn't visit every node, there's a cycle
        if len(execution_order) != len(self.blueprint.nodes):
            missing = set(in_degree.keys()) - set(execution_order)
            raise RuntimeError(
                f"Cycle detected in workflow graph. "
                f"Stuck nodes: {missing}"
            )

        return execution_order

    # ── Dynamic module loading ──────────────────────────────────

    def _resolve_module_folder(self, label: str) -> str:
        """Convert a human label like 'QR Scanner' into the folder name
        'qr_scanner' and verify it exists."""
        folder = label.lower().replace(" ", "_")
        path = os.path.join(MODULES_DIR, folder)
        if not os.path.isdir(path):
            raise FileNotFoundError(
                f"Module folder not found: {path}  "
                f"(resolved from label '{label}')"
            )
        return path

    def _load_module_function(self, label: str):
        """Dynamically import `implementation.py` from the module folder
        and return its `run` callable."""
        module_path = self._resolve_module_folder(label)
        impl_path = os.path.join(module_path, "implementation.py")

        if not os.path.isfile(impl_path):
            raise FileNotFoundError(
                f"implementation.py missing for '{label}' at {impl_path}"
            )

        folder_name = os.path.basename(module_path)
        spec = importlib.util.spec_from_file_location(
            f"servo_module_{folder_name}", impl_path
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        if not hasattr(module, "run"):
            raise AttributeError(
                f"Module '{label}' (file {impl_path}) does not export a 'run(state)' function."
            )

        return module.run

    # ── Execution ───────────────────────────────────────────────

    def execute(self) -> Dict[str, Any]:
        """Run the entire blueprint in topological order.
        Returns the final accumulated state dict."""
        order = self._build_execution_graph()
        nodes_by_id = {node.id: node for node in self.blueprint.nodes}

        for node_id in order:
            node = nodes_by_id[node_id]
            step = {"node_id": node_id, "label": node.label, "status": "pending"}

            print(f"--- Executing Servo: {node.label} ({node_id}) ---")

            try:
                run_func = self._load_module_function(node.label)
                output = run_func(self.state_store)

                if isinstance(output, dict):
                    self.state_store.update(output)
                    step["status"] = "success"
                    step["output_keys"] = list(output.keys())
                    print(f"  -> Output keys: {list(output.keys())}")
                else:
                    step["status"] = "warning"
                    step["message"] = "Module did not return a dict"
                    print(f"  -> Warning: {node.label} returned {type(output).__name__}, expected dict")

            except Exception as e:
                step["status"] = "error"
                step["error"] = str(e)
                self.state_store["_last_error"] = {
                    "module": node.label,
                    "node_id": node_id,
                    "error": str(e),
                }
                print(f"  -> ERROR in {node.label}: {e}")
                # Don't break the whole pipeline — record the error and continue
                # downstream modules will see _last_error in state if they care

            self.execution_log.append(step)

        return self.state_store

    def get_execution_log(self) -> List[Dict[str, Any]]:
        """Returns a structured log of every step executed."""
        return self.execution_log
