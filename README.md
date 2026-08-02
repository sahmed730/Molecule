---
title: Molecule Engine (EasePr)
emoji: 🚀
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# EasePr (Molecule Engine)

An AI-powered software architecture visualizer and builder. It allows developers to input a high-level product goal, automatically generating a visual node-based dependency graph of the required system modules, data contracts, and implementation plans.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/sahmed730/Molecule.git
cd Molecule

# 1. Start the backend
cd backend
python -m venv venv
source venv/Scripts/activate # Windows
pip install -r requirements.txt
cp .env.example .env # Add your API keys
uvicorn main:app --reload

# 2. Start the frontend
cd ../servo-ui
npm install
npm run dev
```

## Installation

### Prerequisites
- Node.js v18+
- Python 3.10+
- Firebase Project (for Authentication & Firestore)
- API Keys for AI Inference (OpenRouter, GLM, etc.)

### Backend Configuration
The backend requires environment variables to function correctly. Create a `.env` file in the `/backend/` directory:
```env
OPENROUTER_API_KEY=your_key_here
FIREBASE_CREDENTIALS_PATH=./path/to/firebase-adminsdk.json
```

### Frontend Configuration
The frontend requires Firebase setup for user sessions and saving architecture projects. Create a `.env` file in `/servo-ui/`:
```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_id
VITE_API_URL=http://127.0.0.1:8000
```

## Usage

### Generating an Architecture
1. Navigate to the **AI Architect** tab in the dashboard.
2. Provide a prompt (e.g., "Build an E-commerce platform with payments & inventory").
3. Optionally upload a context file.
4. The system will ask clarifying questions. Answer them to refine the architecture.
5. The system generates a visual React Flow graph.

### Exporting to Cursor / Claude
You can select a node and click "Compile Mega Prompt" to generate an LLM-ready markdown specification for that specific module, which includes standard contracts, test cases, and dependency context.

## API Reference

### `POST /api/clarify-architecture`
Generates clarifying questions based on a user's initial prompt to refine system requirements.

**Request Body:**
```typescript
interface ClarifyRequest {
  prompt: string;
  graphify_context?: string;
  answers?: Record<string, string>;
}
```

**Returns:**
```json
{
  "confidence_high": false,
  "questions": [
    {
      "id": "q1",
      "question": "Will this system require real-time WebSocket connections?",
      "options": ["Yes", "No", "Only for notifications"]
    }
  ]
}
```

### `POST /api/generate-architecture`
Generates the comprehensive architecture graph including nodes (modules) and edges (dependencies).

**Request Body:**
```typescript
interface ArchitectureRequest {
  prompt: string;
  graphify_context?: string;
  answers?: Record<string, string>;
}
```

**Returns:**
Returns a JSON object containing `nodes` (with full markdown contracts) and `edges`.

## Architecture Documentation

### ADR-001: Separation of Frontend and Backend AI Engine
**Status:** Accepted

**Context:** The architecture visualization is heavily interactive, while the generation requires long-running AI inference loops and Python-native LLM orchestration.

**Decision:** We separated the stack into a Vite + React SPA (`/servo-ui`) and a FastAPI Python backend (`/backend`).

**Rationale:**
- React + React Flow provides the best ecosystem for graph visualization.
- Python provides the best ecosystem for LLM orchestration and data validation (Pydantic).
- FastAPI handles async workloads natively, preventing timeout issues on long AI generations.

### Component Documentation

#### Authentication Flow
Handles user authentication using Firebase Auth.
1. User submits credentials to Firebase from the frontend (`Login.tsx` / `Signup.tsx`).
2. Firebase SDK handles token issuance and persistent local storage.
3. API calls to the backend include the Firebase Bearer token in the Authorization header.
4. FastAPI dependency validates the JWT via Firebase Admin SDK.

#### Module Workspace (`CanvasEditor.tsx`)
The core interactive visualizer.
- Uses `reactflow` for rendering the dependency graph.
- Implements `dagre` for automatic hierarchical layout of modules.
- Allows users to drag and drop blank modules, or dynamically expand existing modules by querying the AI backend for sub-architectures.

## Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Make your changes and write inline comments explaining *why* complex decisions were made.
3. Ensure the UI linter passes (`npm run lint` in `servo-ui`).
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch and open a Pull Request.

## License

Apache License 2.0
