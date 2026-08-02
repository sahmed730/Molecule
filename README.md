<div align="center">
  <img src="servo-ui/public/logo-dark.png" alt="EasePr Logo" width="350"/>

  <h1>EasePr (Molecule Engine)</h1>
  
  <p><strong>An AI-powered software architecture visualizer and builder.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
    <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
    <img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge" alt="License" />
  </p>
</div>

<hr/>

EasePr allows developers to input a high-level product goal and automatically generates a visual, node-based dependency graph of the required system modules, data contracts, and implementation plans. It utilizes state-of-the-art LLMs to plan architectures safely and correctly before a single line of code is written.

## ✨ Features

- 🧠 **AI Architecture Generation:** Leverages advanced AI models to turn natural language into structured architectures.
- 🎨 **Interactive Node Canvas:** A beautiful, draggable, and auto-layout graph visualizing dependencies between modules.
- 📦 **Mega Prompt Export:** Compiles the entire architecture into markdown specifications for Cursor, Claude, or standard developer handoff.
- 🧪 **Test-Driven Architecture:** Outputs strict testing requirements and error-handling specs for each generated module.

## 🚀 Quick Start

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

## ⚙️ Configuration

### Prerequisites
- Node.js v18+
- Python 3.10+
- Firebase Project (Authentication & Firestore)
- API Keys for AI Inference (OpenRouter, GLM, etc.)

### Environment Variables

**Backend (`/backend/.env`)**
```env
OPENROUTER_API_KEY=your_key_here
FIREBASE_CREDENTIALS_PATH=./path/to/firebase-adminsdk.json
```

**Frontend (`/servo-ui/.env`)**
```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_id
VITE_API_URL=http://127.0.0.1:8000
```

## 📖 Usage

### Generating an Architecture
1. Navigate to the **AI Architect** tab in the dashboard.
2. Provide a prompt (e.g., *"Build an E-commerce platform with payments & inventory"*).
3. Optionally upload a context file.
4. The system will ask clarifying questions. Answer them to refine the architecture.
5. The system generates a visual React Flow graph.

### Exporting to Cursor / Claude
You can select a node and click **Compile Mega Prompt** to generate an LLM-ready markdown specification for that specific module, which includes standard contracts, test cases, and dependency context.

## 🔌 API Reference

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

## 🏗️ Architecture Documentation

### ADR-001: Separation of Frontend and Backend AI Engine
- **Status:** Accepted
- **Context:** Architecture generation requires long-running AI inference loops, while visualization requires an interactive UI.
- **Decision:** Separated the stack into a Vite + React SPA (`/servo-ui`) and a FastAPI Python backend (`/backend`).
- **Rationale:** React + React Flow provides the best ecosystem for graph visualization, while Python + FastAPI manages asynchronous LLM streams efficiently without timeout restrictions.

### Core Components
- **Authentication Flow:** Managed by Firebase Auth. API calls to the backend include the Firebase Bearer token in the `Authorization` header, validated by FastAPI dependency injection.
- **CanvasEditor:** The interactive workspace using `reactflow` for rendering and `dagre` for automated hierarchical layout.

## 🤝 Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Make your changes and write inline comments explaining *why* complex decisions were made.
3. Ensure the UI linter passes (`npm run lint` in `servo-ui`).
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch and open a Pull Request.

## 📜 License

This project is licensed under the **Apache License 2.0**.
