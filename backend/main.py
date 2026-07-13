import os
import sys
import tempfile
import shutil
# Force UTF-8 output on Windows to prevent emoji/unicode chars crashing the server
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
    sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
from markitdown import MarkItDown
from backend.engine.ai_generator import (
    suggest_architecture,
    generate_logic_flowchart,
    review_single_module,
    auto_improve_architecture,
    expand_architecture,
    batch_expand_architecture,
    generate_clarifying_questions,
    suggest_architecture_stream,
    extract_graph_json,
    chat_update_module,
    chat_update_module_stream,
)
from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, status
from backend import auth

app = FastAPI(title="EasePr Engine", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://molecule-plum.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request Models ──────────────────────────────────────────

class ClarifyRequest(BaseModel):
    prompt: str
    graphify_context: Optional[str] = None

class ArchitectureRequest(BaseModel):
    prompt: str
    graphify_context: Optional[str] = None
    answers: Optional[dict] = None

class FlowchartRequest(BaseModel):
    coreTask: str
    dataShape: str = ""
    expectedOutput: str = ""
    rules: str = ""
    name: str = ""
    errorHandling: str = ""

class ModuleReviewRequest(BaseModel):
    module_data: dict

class AutoImproveRequest(BaseModel):
    graph_data: dict
    instruction: Optional[str] = None
    original_reasoning: Optional[str] = None

class ExpandRequest(BaseModel):
    graph_data: dict
    module_name: str
    reason: str
    original_reasoning: Optional[str] = None

class BatchExpandRequest(BaseModel):
    graph_data: dict
    modules: list
    original_reasoning: Optional[str] = None

class ExtractGraphRequest(BaseModel):
    markdown_text: str

class ChatModuleRequest(BaseModel):
    module_data: dict
    user_message: str


# ── Auth & Project Endpoints ────────────────────────────────
# Moved to Firebase/Firestore on the frontend.

# ── Endpoints ───────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"status": "EasePr Engine is running", "version": "0.2.0"}


@app.post("/api/upload-context")
async def api_upload_context(file: UploadFile = File(...)):
    """Uploads a document, converts it to Markdown via MarkItDown, and safely deletes it."""
    temp_file_path = None
    try:
        # Create a secure temporary file
        temp_dir = tempfile.gettempdir()
        temp_file_path = os.path.join(temp_dir, file.filename)
        
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        md = MarkItDown()
        result = md.convert(temp_file_path)
        markdown_text = result.text_content
        
        return {"status": "success", "markdown": markdown_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Guarantee the original file is deleted from the backend system
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)


@app.post("/api/clarify-architecture")
def api_clarify_architecture(req:  ClarifyRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 2: Generate domain-adaptive clarifying questions."""
    try:
        result = generate_clarifying_questions(req.prompt, req.graphify_context, req.answers)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/suggest-architecture")
def api_suggest_architecture(req:  ArchitectureRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 3: Reasoning-based architecture generation."""
    try:
        suggestion = suggest_architecture(req.prompt, req.graphify_context, req.answers)
        return {"status": "success", "suggestion": suggestion}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from fastapi.responses import StreamingResponse

@app.post("/api/suggest-architecture-stream")
def api_suggest_architecture_stream(req:  ArchitectureRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 3 (Streaming): Reasoning-based architecture generation returning pure Markdown."""
    def event_generator():
        for chunk in suggest_architecture_stream(req.prompt, req.graphify_context, req.answers):
            # Format as SSE
            # Replace newlines in chunk with something SSE safe, or use proper data: payload
            # Fast way for simple markdown: just send the chunk as a plain string using StreamingResponse text/plain,
            # or SSE with data. We will use SSE format for better reliability.
            lines = chunk.split('\n')
            for line in lines:
                yield f"data: {line}\n"
            yield "data: \n\n" # empty line separates events, but chunk might not have them properly.
            
            # Actually, standard text/event-stream expects data: payload\n\n
            # Let's just yield the raw string but we must format it as JSON or proper SSE.
            # Simple SSE:
            # yield f"data: {repr(chunk)}\n\n"
            
    # Wait, the easiest way to stream markdown directly to frontend without SSE parsing is just streaming text.
    def text_generator():
        for chunk in suggest_architecture_stream(req.prompt, req.graphify_context, req.answers):
            yield chunk

    return StreamingResponse(text_generator(), media_type="text/plain")

@app.post("/api/extract-graph-json")
def api_extract_graph_json(req:  ExtractGraphRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Parses pure Markdown into React Flow Graph JSON."""
    try:
        graph = extract_graph_json(req.markdown_text)
        return {"status": "success", "graph": graph}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat-module")
def api_chat_module(req:  ChatModuleRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Interactive chat for editing a specific module."""
    try:
        updated_module = chat_update_module(req.module_data, req.user_message)
        return {"status": "success", "module": updated_module}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat-module-stream")
def api_chat_module_stream(req:  ChatModuleRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Interactive chat for editing a specific module, streaming markdown."""
    def text_generator():
        for chunk in chat_update_module_stream(req.module_data, req.user_message):
            yield chunk

    return StreamingResponse(text_generator(), media_type="text/plain")


@app.post("/api/generate-flowchart")
def api_generate_flowchart(req:  FlowchartRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Generate a Mermaid.js flowchart for a module's internal logic."""
    try:
        chart = generate_logic_flowchart(req.dict())
        return {"status": "success", "chart": chart}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/review-module")
def api_review_module(req:  ModuleReviewRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 4: Localized module review."""
    try:
        review = review_single_module(req.module_data)
        return {"status": "success", "review": review}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/auto-improve-architecture")
def api_auto_improve_architecture(req:  AutoImproveRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 5: Intelligent graph optimization."""
    try:
        updated_graph = auto_improve_architecture(req.graph_data, req.instruction, req.original_reasoning)
        return {"status": "success", "graph": updated_graph}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    prompt: str

class ClarifyRequest(BaseModel):
    prompt: str
    graphify_context: Optional[str] = None
    answers: Optional[dict] = None

class ArchitectureRequest(BaseModel):
    prompt: str
    graphify_context: Optional[str] = None
    answers: Optional[dict] = None

class FlowchartRequest(BaseModel):
    coreTask: str
    dataShape: str = ""
    expectedOutput: str = ""
    rules: str = ""
    name: str = ""
    errorHandling: str = ""

class ModuleReviewRequest(BaseModel):
    module_data: dict

class AutoImproveRequest(BaseModel):
    graph_data: dict
    instruction: Optional[str] = None
    original_reasoning: Optional[str] = None

class ExpandRequest(BaseModel):
    graph_data: dict
    module_name: str
    reason: str
    original_reasoning: Optional[str] = None

class BatchExpandRequest(BaseModel):
    graph_data: dict
    modules: list
    original_reasoning: Optional[str] = None

class ExtractGraphRequest(BaseModel):
    markdown_text: str

class ChatModuleRequest(BaseModel):
    module_data: dict
    user_message: str


# ── Auth & Project Endpoints ────────────────────────────────
# Moved to Firebase/Firestore on the frontend.

# ── Endpoints ───────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"status": "EasePr Engine is running", "version": "0.2.0"}


@app.post("/api/upload-context")
async def api_upload_context(file: UploadFile = File(...)):
    """Uploads a document, converts it to Markdown via MarkItDown, and safely deletes it."""
    temp_file_path = None
    try:
        # Create a secure temporary file
        temp_dir = tempfile.gettempdir()
        temp_file_path = os.path.join(temp_dir, file.filename)
        
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        md = MarkItDown()
        result = md.convert(temp_file_path)
        markdown_text = result.text_content
        
        return {"status": "success", "markdown": markdown_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Guarantee the original file is deleted from the backend system
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)


@app.post("/api/clarify-architecture")
def api_clarify_architecture(req:  ClarifyRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 2: Generate domain-adaptive clarifying questions."""
    try:
        result = generate_clarifying_questions(req.prompt, req.graphify_context, req.answers)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/suggest-architecture")
def api_suggest_architecture(req:  ArchitectureRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 3: Reasoning-based architecture generation."""
    try:
        suggestion = suggest_architecture(req.prompt, req.graphify_context, req.answers)
        return {"status": "success", "suggestion": suggestion}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from fastapi.responses import StreamingResponse

@app.post("/api/suggest-architecture-stream")
def api_suggest_architecture_stream(req:  ArchitectureRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 3 (Streaming): Reasoning-based architecture generation returning pure Markdown."""
    def event_generator():
        for chunk in suggest_architecture_stream(req.prompt, req.graphify_context, req.answers):
            # Format as SSE
            # Replace newlines in chunk with something SSE safe, or use proper data: payload
            # Fast way for simple markdown: just send the chunk as a plain string using StreamingResponse text/plain,
            # or SSE with data. We will use SSE format for better reliability.
            lines = chunk.split('\n')
            for line in lines:
                yield f"data: {line}\n"
            yield "data: \n\n" # empty line separates events, but chunk might not have them properly.
            
            # Actually, standard text/event-stream expects data: payload\n\n
            # Let's just yield the raw string but we must format it as JSON or proper SSE.
            # Simple SSE:
            # yield f"data: {repr(chunk)}\n\n"
            
    # Wait, the easiest way to stream markdown directly to frontend without SSE parsing is just streaming text.
    def text_generator():
        for chunk in suggest_architecture_stream(req.prompt, req.graphify_context, req.answers):
            yield chunk

    return StreamingResponse(text_generator(), media_type="text/plain")

@app.post("/api/extract-graph-json")
def api_extract_graph_json(req:  ExtractGraphRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Parses pure Markdown into React Flow Graph JSON."""
    try:
        graph = extract_graph_json(req.markdown_text)
        return {"status": "success", "graph": graph}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat-module")
def api_chat_module(req:  ChatModuleRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Interactive chat for editing a specific module."""
    try:
        updated_module = chat_update_module(req.module_data, req.user_message)
        return {"status": "success", "module": updated_module}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat-module-stream")
def api_chat_module_stream(req:  ChatModuleRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Interactive chat for editing a specific module, streaming markdown."""
    def text_generator():
        for chunk in chat_update_module_stream(req.module_data, req.user_message):
            yield chunk

    return StreamingResponse(text_generator(), media_type="text/plain")


@app.post("/api/generate-flowchart")
def api_generate_flowchart(req:  FlowchartRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Generate a Mermaid.js flowchart for a module's internal logic."""
    try:
        chart = generate_logic_flowchart(req.dict())
        return {"status": "success", "chart": chart}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/review-module")
def api_review_module(req:  ModuleReviewRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 4: Localized module review."""
    try:
        review = review_single_module(req.module_data)
        return {"status": "success", "review": review}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/auto-improve-architecture")
def api_auto_improve_architecture(req:  AutoImproveRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Stage 5: Intelligent graph optimization."""
    try:
        updated_graph = auto_improve_architecture(req.graph_data, req.instruction, req.original_reasoning)
        return {"status": "success", "graph": updated_graph}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/expand-architecture")
def api_expand_architecture(req:  ExpandRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Add a single new module to the architecture."""
    try:
        result = expand_architecture(req.graph_data, req.module_name, req.reason, req.original_reasoning)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/batch-expand-architecture")
async def api_batch_expand_architecture(req:  BatchExpandRequest, current_user: auth.User = Depends(auth.get_authorized_user)):
    """Add multiple modules concurrently."""
    try:
        result = await batch_expand_architecture(req.graph_data, req.modules, req.original_reasoning)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
