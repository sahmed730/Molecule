# 🤖 AGENT KNOWLEDGE BASE: Software Servo Framework

> **ATTENTION AI AGENT:** If you are reading this, you have been assigned to work on the "Software Servo" project. This document contains the entire history, architecture, and philosophy of the project. Read it carefully before making any modifications.

## 1. The Core Philosophy: "Software Servos"
This project was born from an analogy: **Mechanical engineering vs. Software engineering.**
*   **The Past (Gears):** In the past, engineers built machines by manually cutting gears and wiring motors. In software, this is equivalent to writing custom boilerplate for every database, auth system, or API connection.
*   **The Present (Servos):** Modern mechanical engineers use **Servo Motors**. A servo is a black box that hides the gears and motors. It exposes a strict contract: *Supply 5V power, send a PWM signal, and the shaft moves to an angle.*
*   **The Goal (Software Servos):** This project applies that logic to software. We do not write monolithic code. We create AI-generated **Modules (Servos)** that have strict inputs, outputs, and purposes. The software developer (or user) simply wires these servos together visually.

## 2. System Architecture
The platform is an IDE divided into a Frontend Canvas and a Backend Engine.

### A. The Frontend (`servo-ui/`)
A visual IDE built with **React, TypeScript, Vite, Tailwind CSS v4, and React Flow**.
*   **Run command:** `npm run dev` (Runs on port 5173).
*   **`Sidebar.tsx`:** Contains a library of available servos. Users drag from here.
*   **`ServoNode.tsx`:** The visual representation of a module on the canvas. Designed to look like a physical hardware component with an input (top) and output (bottom) port.
*   **`CanvasEditor.tsx`:** The core workspace.
    *   **Drag-and-Drop:** Uses the HTML5 drag-and-drop API to place nodes.
    *   **Auto-Connect:** When a new node is dropped, if nodes already exist, it automatically draws a wire (edge) from the last node to the new node.
    *   **Blueprint Export:** Converts the visual nodes and edges into a `workflow.json` (Blueprint) and sends it via a `POST` request to the backend.
    *   **Terminal Panel:** Displays the JSON response from the backend execution.
    *   **New Project:** Clears the React Flow state to start fresh.

### B. The Backend Engine (`backend/`)
The "Motherboard" that executes the blueprints. Built with **Python, FastAPI, and Pydantic**.
*   **Run command:** `uvicorn main:app --reload --port 8000` (from within the virtual environment).
*   **`engine/schema.py`:** The strict standard. Uses Pydantic to define `ModuleMetadata` and `WorkflowBlueprint`. This ensures the UI and Backend speak the exact same language.
*   **`engine/runner.py` (The Core Logic):**
    1.  Receives the Blueprint.
    2.  Calculates the execution order (Topological Sort based on the edges/wires).
    3.  Maintains a `state_store` (a global dictionary).
    4.  Dynamically loads the python file for the requested module (`implementation.py`).
    5.  Executes the module, passing the `state_store` in, and merges the module's output back into the `state_store`.
*   **`main.py`:** The FastAPI server exposing the `/api/execute` endpoint.

## 3. The Module Standard (The Servo Contract)
For an AI to generate a module, or for the engine to run it, it must live in `backend/modules/<module_name>/` and contain exactly two files:

### `metadata.json`
The contract. Example:
```json
{
    "name": "Duplicate Checker",
    "purpose": "Checks if the provided ID has already been processed today.",
    "language": "Python",
    "inputs": ["qr_data"],
    "outputs": ["is_duplicate", "processed_id"]
}
```

### `implementation.py`
The "gears". Must contain a `run(state: dict) -> dict` function. Example:
```python
def run(state: dict) -> dict:
    input_data = state.get("qr_data")
    if not input_data:
        raise ValueError("Missing required input 'qr_data'")
    
    # ... logic here ...
    
    return {
        "processed_id": input_data,
        "is_duplicate": False
    }
```

## 4. History of Implementation
1.  **Milestone 1:** Created the React Flow visual canvas. Implemented the hardware design language, drag-and-drop, wiring, and Tailwind v4 setup.
2.  **Milestone 2:** Built the Python backend, the runner logic, and two mock modules (`QR Scanner`, `Duplicate Checker`). Tested local execution.
3.  **Integration:** Connected the React `Deploy Blueprint` button to the FastAPI backend. Added a visual Terminal to the frontend to view results.
4.  **UX Polish:** Added the Auto-Connect feature (dropping a node automatically wires it) and a New Project clear button.

## 5. Next Steps for the AI Agent
When the user asks to continue, your likely next tasks will be:
1.  **The Module Generator:** Create a script (perhaps in the backend) that takes a prompt like `"Create a WhatsApp Notifier servo"` and uses an LLM API to automatically generate the `metadata.json` and `implementation.py` files, placing them in the `modules/` folder.
2.  **Dynamic Library Sync:** Currently, the `Sidebar.tsx` in the frontend has a hardcoded list of available servos. The backend should have an endpoint (e.g., `GET /api/modules`) that reads the `modules/` directory and sends the list to the frontend so the sidebar updates automatically when a new servo is generated.