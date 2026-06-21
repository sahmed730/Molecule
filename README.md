# EasyPR / Software Servo

An AI-powered software architecture visualizer and builder. It allows developers to input a high-level product goal, automatically generating a visual node-based dependency graph of the required system modules, data contracts, and implementation plans.

## 🚀 Features

*   **AI Architecture Generation:** Leverages advanced AI models to turn natural language product goals into structured, component-based architectures.
*   **Interactive Node Canvas:** A beautiful, draggable, and auto-layout graph (powered by React Flow and Dagre) visualizing dependencies between modules.
*   **Mega Prompt Export:** Compiles the entire architecture, including API contracts and user clarifications, into "Mega Prompts" formatted specifically for Cursor, Claude, or standard developer handoff.
*   **Test-Driven Architecture:** Outputs strict testing requirements and error-handling specs for each generated module.

## 🛠️ Tech Stack

*   **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Flow, Lucide React.
*   **Backend:** FastAPI, Python, integrating with AI providers (NVIDIA/MiniMax-M3, GLM-5.1) for deep reasoning and architecture generation.

## 📂 Project Structure

*   `/servo-ui/` - The React frontend application.
*   `/backend/` - The FastAPI server and AI generation engine.
*   `/docs/` - Additional agent and project documentation.

## 🏃‍♂️ Getting Started

### Backend Setup
1. Navigate to the `backend` directory.
2. Create a virtual environment: `python -m venv venv`
3. Activate the virtual environment.
4. Install dependencies: `pip install -r requirements.txt`
5. Set up your `.env` file with the required API keys (see `.env.example`).
6. Run the server: `uvicorn main:app --reload`

### Frontend Setup
1. Navigate to the `servo-ui` directory.
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`

## 📝 License
MIT License
