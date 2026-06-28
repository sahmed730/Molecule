from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


# ──────────────────────────────────────────────
# Module metadata — the "contract" every module
# must satisfy when it lives on the canvas.
# ──────────────────────────────────────────────

class ModuleMetadata(BaseModel):
    """Full specification of a single Servo module."""
    name: str
    coreTask: str
    dataShape: str
    expectedOutput: str
    rules: str = ""
    language: str = "Python"
    dependencies: str = ""
    errorHandling: str = ""
    testingRequirements: str = ""


# ──────────────────────────────────────────────
# Workflow Blueprint — what the UI sends when
# the user clicks "Run" or "Generate Mega Prompt"
# ──────────────────────────────────────────────

class WorkflowNode(BaseModel):
    """A node on the canvas.  Carries the full module spec so the
    runner can generate code, validate contracts, etc."""
    id: str
    label: str
    coreTask: str = ""
    dataShape: str = ""
    expectedOutput: str = ""
    rules: str = ""
    language: str = "Python"
    dependencies: str = ""
    errorHandling: str = ""
    testingRequirements: str = ""


class WorkflowConnection(BaseModel):
    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")


class WorkflowBlueprint(BaseModel):
    nodes: List[WorkflowNode]
    connections: List[WorkflowConnection]

    class Config:
        populate_by_name = True


# ──────────────────────────────────────────────
# Project Context — DB tables, API surface, and
# shared state that modules can reference.
# ──────────────────────────────────────────────

class DatabaseTable(BaseModel):
    table_name: str
    columns: List[str]
    description: str


class ApiEndpoint(BaseModel):
    method: str
    path: str
    payload: str
    response: str


class ProjectContext(BaseModel):
    databaseSchema: List[DatabaseTable] = []
    apiEndpoints: List[ApiEndpoint] = []
    globalState: Dict[str, str] = {}


# ──────────────────────────────────────────────
# Architecture Review — structured output from
# the review-architecture endpoint.
# ──────────────────────────────────────────────

class DuplicateEntry(BaseModel):
    id: str
    duplicatesId: str
    name: str = ""
    reason: str = ""


class SuggestedModule(BaseModel):
    name: str
    reason: str = ""
    improvementScore: int = 0


class ArchitectureReview(BaseModel):
    score: int
    complexityPenalty: int = 0
    architectureMaturity: str = "Draft"
    modularity: int = 0
    scalability: int = 0
    security: int = 0
    maintainability: int = 0
    coreRequirementsMet: int = 0
    missingCapabilities: List[str] = []
    duplicates: List[DuplicateEntry] = []
    critical: List[SuggestedModule] = []
    recommended: List[SuggestedModule] = []
    optional: List[SuggestedModule] = []
    risks: List[str] = []
