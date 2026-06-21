# EasePr — Project Info

> This file is a lightweight summary. For the full technical reference, see [AGENT_KNOWLEDGE.md](./AGENT_KNOWLEDGE.md).

## What It Is
EasePr is a visual, node-based IDE for designing software architectures. Users describe what they want in plain text; the AI decomposes it into modules with strict input/output contracts and renders a wired-up graph on a canvas. Users can also build manually and export a "Mega Prompt" for any LLM.

## How To Run
```bash
# Frontend (port 5173)
cd servo-ui && npm run dev

# Backend (port 8000)
cd backend && .\venv\Scripts\python.exe -m uvicorn main:app --reload
```

## Milestones Completed
1. React Flow visual canvas with drag-and-drop wiring
2. Python backend with FastAPI + Gemini AI architecture generator
3. Frontend ↔ Backend integration (text prompt → rendered node graph)
4. Module editor panel, Mega Prompt export, auto-connect on drop
5. Full EasePr rebranding across all files