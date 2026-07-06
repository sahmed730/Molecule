# Graph Report - softwereservo  (2026-06-29)

## Corpus Check
- 48 files · ~26,569 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 334 nodes · 459 edges · 31 communities (24 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a8162ff0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 17 edges
2. `User` - 16 edges
3. `compilerOptions` - 16 edges
4. `_call_fast_model()` - 13 edges
5. `useAppStore` - 13 edges
6. `_extract_json()` - 11 edges
7. `suggest_architecture()` - 9 edges
8. `get_cached_response()` - 9 edges
9. `set_cached_response()` - 9 edges
10. `EngineRunner` - 9 edges

## Surprising Connections (you probably didn't know these)
- `api_classify_system()` --calls--> `classify_system_type()`  [EXTRACTED]
  backend/main.py → backend/engine/ai_generator.py
- `api_clarify_architecture()` --calls--> `generate_clarifying_questions()`  [EXTRACTED]
  backend/main.py → backend/engine/ai_generator.py
- `api_suggest_architecture()` --calls--> `suggest_architecture()`  [EXTRACTED]
  backend/main.py → backend/engine/ai_generator.py
- `api_extract_graph_json()` --calls--> `extract_graph_json()`  [EXTRACTED]
  backend/main.py → backend/engine/ai_generator.py
- `api_review_module()` --calls--> `review_single_module()`  [EXTRACTED]
  backend/main.py → backend/engine/ai_generator.py

## Import Cycles
- 3-file cycle: `servo-ui/src/App.tsx -> servo-ui/src/pages/Login.tsx -> servo-ui/src/firebase.ts -> servo-ui/src/App.tsx`
- 3-file cycle: `servo-ui/src/App.tsx -> servo-ui/src/pages/Signup.tsx -> servo-ui/src/firebase.ts -> servo-ui/src/App.tsx`
- 3-file cycle: `servo-ui/src/App.tsx -> servo-ui/src/pages/Dashboard.tsx -> servo-ui/src/firebase.ts -> servo-ui/src/App.tsx`

## Communities (31 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (55): User, batch_expand_architecture(), expand_architecture(), generate_logic_flowchart(), Adds a single new module with validated connections., Generates multiple modules concurrently., Generate Mermaid.js flowchart for a module's logic., api_auto_improve_architecture() (+47 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (53): AsyncOpenAI, _async_call_fast_model(), async_expand_architecture(), _async_get_client(), auto_improve_architecture(), _call_fast_model(), _call_thinking_model(), _call_thinking_model_stream() (+45 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (23): get_authorized_user(), get_current_user(), get_firebase_certs(), Restricts AI generation capabilities to the owner's account., verify_firebase_token(), HTTPAuthorizationCredentials, PrivateRoute(), CanvasEditor() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (22): Any, EngineRunner, Executes a WorkflowBlueprint by topologically sorting the DAG     and running ea, Returns a structured log of every step executed., Topological sort (Kahn's algorithm) over the blueprint DAG.         Returns a li, Convert a human label like 'QR Scanner' into the folder name         'qr_scanner, Dynamically import `implementation.py` from the module folder         and return, Run the entire blueprint in topological order.         Returns the final accumul (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (28): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+20 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (14): 1. The Core Philosophy: "Software Servos", 2. System Architecture, 3. The Module Standard (The Servo Contract), 4. History of Implementation, 5. Next Steps for the AI Agent, A. The Frontend (`servo-ui/`), 🤖 AGENT KNOWLEDGE BASE: Software Servo Framework, B. The Backend Engine (`backend/`) (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (13): dependencies, dagre, firebase, lucide-react, mermaid, react, react-dom, react-markdown (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (8): Backend Setup, EasyPR / Software Servo, 🚀 Features, Frontend Setup, 🏃‍♂️ Getting Started, 📝 License, 📂 Project Structure, 🛠️ Tech Stack

### Community 10 - "Community 10"
Cohesion: 0.40
Nodes (4): name, scripts, build, version

### Community 11 - "Community 11"
Cohesion: 0.50
Nodes (3): getCompleteness(), ServoNode(), ServoNodeData

### Community 12 - "Community 12"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + TypeScript + Vite

### Community 13 - "Community 13"
Cohesion: 0.50
Nodes (3): buildCommand, framework, outputDirectory

## Knowledge Gaps
- **109 isolated node(s):** `Config`, `name`, `version`, `build`, `name` (+104 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 8` to `Community 4`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Why does `firebase` connect `Community 8` to `Community 2`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **What connects `Restricts AI generation capabilities to the owner's account.`, `ai_generator.py — Multi-stage reasoning pipeline for architectural cognition.`, `Returns an OpenAI client pointed at the NVIDIA API.` to the rest of the system?**
  _171 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.050816696914700546 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06493506493506493 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09103840682788052 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.10114942528735632 - nodes in this community are weakly interconnected._