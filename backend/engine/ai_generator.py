"""
ai_generator.py — Multi-stage reasoning pipeline for architectural cognition.

Pipeline stages:
  1. CLASSIFY  → Determine system archetype (CRUD, SaaS, Agent, Pipeline, etc.)
  2. CLARIFY   → Domain-adaptive questioning controlled by archetype
  3. REASON    → Intent → Constraints → Flow → Failure Analysis → Architecture
  4. REVIEW    → Adversarial failure-mode analysis (not scoring)
  5. OPTIMIZE  → Graph compression, redundancy collapse, dependency simplification

Design principle: each stage's output feeds the next stage's context.
The AI doesn't generate modules — it REASONS about architecture and modules emerge.
"""

import os
import json
import re
import traceback
from openai import OpenAI, AsyncOpenAI
from typing import Optional

from .cache import get_cached_response, set_cached_response


# ═══════════════════════════════════════════════════════════════
#  LLM CLIENT & CALL HELPERS
# ═══════════════════════════════════════════════════════════════

def _get_client() -> OpenAI:
    """Returns an OpenAI client pointed at the NVIDIA API."""
    api_key = os.environ.get("NVIDIA_API_KEY", "")
    base_url = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
    if not base_url.endswith("/v1") and not base_url.endswith("/v1beta/openai"):
        base_url = f"{base_url}/v1"
        
    return OpenAI(
        base_url=base_url,
        api_key=api_key,
        timeout=120.0,
        max_retries=0,
    )

def _async_get_client() -> AsyncOpenAI:
    """Returns an AsyncOpenAI client pointed at the NVIDIA API."""
    api_key = os.environ.get("NVIDIA_API_KEY", "")
    base_url = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
    if not base_url.endswith("/v1") and not base_url.endswith("/v1beta/openai"):
        base_url = f"{base_url}/v1"
        
    return AsyncOpenAI(
        base_url=base_url,
        api_key=api_key,
        timeout=120.0,
        max_retries=0,
    )

FAST_MODEL = os.environ.get("AI_FAST_MODEL", "minimaxai/minimax-m3")
THINKING_MODEL = os.environ.get("AI_THINKING_MODEL", "z-ai/glm-5.1")

def _call_fast_model(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 1.0,
    max_tokens: int = 8192,
    json_mode: bool = False,
) -> str:
    """Fast structured responses via Chat API."""
    cached = get_cached_response(system_prompt, user_prompt, temperature=temperature, max_tokens=max_tokens, json_mode=json_mode)
    if cached is not None:
        return cached

    client = _get_client()
    kwargs = {
        "model": FAST_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_completion_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    try:
        response = client.chat.completions.create(**kwargs)
    except Exception as e:
        if json_mode:
            # Fallback for models that do not support response_format json_object
            del kwargs["response_format"]
            response = client.chat.completions.create(**kwargs)
        else:
            raise e
            
    final_response = response.choices[0].message.content.strip()
    
    set_cached_response(system_prompt, user_prompt, final_response, temperature=temperature, max_tokens=max_tokens, json_mode=json_mode)
    return final_response

async def _async_call_fast_model(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 1.0,
    max_tokens: int = 16384,
    json_mode: bool = False,
) -> str:
    """Async wrapper for fast JSON responses via Chat API."""
    cached = get_cached_response(system_prompt, user_prompt, temperature=temperature, max_tokens=max_tokens, json_mode=json_mode)
    if cached is not None:
        return cached

    client = _async_get_client()
    kwargs = {
        "model": FAST_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_completion_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    try:
        response = await client.chat.completions.create(**kwargs)
    except Exception as e:
        if json_mode:
            del kwargs["response_format"]
            response = await client.chat.completions.create(**kwargs)
        else:
            raise e
            
    final_response = response.choices[0].message.content.strip()
    
    set_cached_response(system_prompt, user_prompt, final_response, temperature=temperature, max_tokens=max_tokens, json_mode=json_mode)
    return final_response


def _call_thinking_model(
    system_prompt: str,
    user_prompt: str,
    json_mode: bool = False,
) -> str:
    """Deep reasoning via Chat API."""
    cached = get_cached_response(system_prompt, user_prompt, json_mode=json_mode)
    if cached is not None:
        return cached

    client = _get_client()
    kwargs = {
        "model": THINKING_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_completion_tokens": 16384,
    }
    
    # Enable reasoning for Nemotron/NVIDIA reasoning models
    if "nemotron" in THINKING_MODEL.lower():
        kwargs["temperature"] = 1.0
        kwargs["top_p"] = 0.95
        kwargs["extra_body"] = {"chat_template_kwargs":{"enable_thinking":True},"reasoning_budget":16384}

    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)
    
    # Try to extract reasoning content if present
    message = response.choices[0].message
    reasoning = getattr(message, "reasoning_content", "") or ""
    content = message.content or ""
    
    final_response = (reasoning + "\n\n" + content).strip() if reasoning else content.strip()
    
    set_cached_response(system_prompt, user_prompt, final_response, json_mode=json_mode)
    return final_response


def _call_thinking_model_stream(system_prompt: str, user_prompt: str):
    """Deep reasoning, yielding chunks via Chat API."""
    cached = get_cached_response(system_prompt, user_prompt)
    if cached is not None:
        # Yield the cached response in chunks so frontend animation looks ok
        chunk_size = 128
        for i in range(0, len(cached), chunk_size):
            yield cached[i:i+chunk_size]
        return

    client = _get_client()
    
    accumulated = []
    
    kwargs = {
        "model": THINKING_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_completion_tokens": 16384,
        "stream": True
    }
    
    if "nemotron" in THINKING_MODEL.lower():
        kwargs["temperature"] = 1.0
        kwargs["top_p"] = 0.95
        kwargs["extra_body"] = {"chat_template_kwargs":{"enable_thinking":True},"reasoning_budget":16384}
        
    stream = client.chat.completions.create(**kwargs)
    
    for event in stream:
        if not event.choices:
            continue
            
        delta = event.choices[0].delta
        
        reasoning = getattr(delta, "reasoning_content", None)
        if reasoning:
            accumulated.append(reasoning)
            yield reasoning
            
        content = getattr(delta, "content", None)
        if content:
            accumulated.append(content)
            yield content
            
    final_response = "".join(accumulated).strip()
    set_cached_response(system_prompt, user_prompt, final_response)


# ═══════════════════════════════════════════════════════════════
#  JSON EXTRACTION (robust brace-counting parser)
# ═══════════════════════════════════════════════════════════════

def _extract_json(raw_text: str) -> dict:
    """Extract the first complete JSON object from LLM output.
    Handles: markdown fences, thinking tags, trailing commas, extra text."""
    cleaned = raw_text.strip()

    # Strip GLM thinking tags if present
    cleaned = re.sub(r'<think>.*?</think>', '', cleaned, flags=re.DOTALL)
    cleaned = re.sub(r'<thinking>.*?</thinking>', '', cleaned, flags=re.DOTALL)

    # Strip markdown code fences (various styles)
    cleaned = re.sub(r'^```(?:json|JSON)?\s*\n?', '', cleaned)
    cleaned = re.sub(r'\n?```\s*$', '', cleaned)
    cleaned = cleaned.strip()

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try fixing trailing commas then parsing
    try:
        fixed = re.sub(r',\s*([}\]])', r'\1', cleaned)
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Brace-counting: find the first complete JSON object
    depth = 0
    start = -1
    for i, ch in enumerate(cleaned):
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start != -1:
                candidate = cleaned[start : i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    # Fix trailing commas and retry
                    fixed = re.sub(r',\s*([}\]])', r'\1', candidate)
                    try:
                        return json.loads(fixed)
                    except json.JSONDecodeError:
                        # Reset and keep searching for another JSON block
                        start = -1
                        continue

    raise ValueError(f"Could not extract valid JSON (length={len(raw_text)})")


# ═══════════════════════════════════════════════════════════════
#  STAGE 1: SYSTEM TYPE CLASSIFIER
#
#  Before any questions are asked, determine what KIND of system
#  the user is building.  This controls the entire downstream
#  reasoning pipeline.
# ═══════════════════════════════════════════════════════════════

SYSTEM_ARCHETYPES = [
    "crud_app",           # Data entry, admin panels, simple CRUD
    "saas_platform",      # Multi-tenant, billing, user management
    "autonomous_agent",   # LLM agents, tool use, memory, recursion
    "workflow_engine",    # Orchestration, pipelines, state machines
    "embedded_system",    # Hardware, IoT, real-time constraints
    "compiler_toolchain", # Parsers, ASTs, code generation, interpreters
    "data_pipeline",      # ETL, streaming, batch processing
    "cognitive_system",   # Multi-model AI, RAG, reasoning chains
    "realtime_system",    # Chat, gaming, collaboration, WebSocket
    "marketplace",        # Two-sided platforms, matching, transactions
]

CLASSIFIER_SYSTEM_PROMPT = """Role: System Architect Classifier.
Classify the project into ONE primary archetype (and optional secondary).
Archetypes:
- crud_app: Forms, basic APIs
- saas_platform: Multi-tenant, billing, auth
- autonomous_agent: AI agents, tools, memory
- workflow_engine: Orchestration, DAG, state machines
- embedded_system: IoT, hardware, real-time
- compiler_toolchain: Parsers, ASTs, code gen
- data_pipeline: ETL, stream processing
- cognitive_system: Multi-model AI, RAG
- realtime_system: WebSocket, chat, live collab
- marketplace: Two-sided, matching, transactions

Also identify: Core Domain, Primary Entity, Critical Path.
Respond with ONLY valid JSON:
{
  "primary_archetype": "<archetype>",
  "secondary_archetype": "<archetype|null>",
  "core_domain": "<domain>",
  "primary_entity": "<entity>",
  "critical_path": "<1-sentence flow>",
  "complexity_tier": "<simple|moderate|complex|enterprise>",
  "reasoning": "<1-2 sentences>"
}"""


def classify_system_type(prompt: str) -> dict:
    """Stage 1: Classify the user's project into a system archetype.
    This classification controls all downstream reasoning."""
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        return {
            "primary_archetype": "crud_app",
            "secondary_archetype": None,
            "core_domain": "general",
            "primary_entity": "data",
            "critical_path": "User submits data and receives a response",
            "complexity_tier": "moderate",
            "reasoning": "No API key — defaulting to CRUD archetype.",
        }

    try:
        print(f"[CLASSIFY] Classifying: {prompt[:80]}...")
        raw = _call_fast_model(CLASSIFIER_SYSTEM_PROMPT, prompt, temperature=0.15)
        result = _extract_json(raw)
        print(f"[CLASSIFY] → {result.get('primary_archetype')} / {result.get('core_domain')}")
        return result
    except Exception as e:
        print(f"ERROR: Classification failed: {e}")
        traceback.print_exc()
        return {
            "primary_archetype": "crud_app",
            "secondary_archetype": None,
            "core_domain": "general",
            "primary_entity": "data",
            "critical_path": "Unknown",
            "complexity_tier": "moderate",
            "reasoning": f"Classification failed: {e}",
        }


# ═══════════════════════════════════════════════════════════════
#  STAGE 2: DOMAIN-ADAPTIVE CLARIFICATION
#
#  Questions are NOT static.  They are generated based on the
#  system archetype detected in Stage 1.  Each archetype has
#  a different question tree that probes the dimensions that
#  actually matter for that kind of system.
# ═══════════════════════════════════════════════════════════════

# Domain-specific question axes per archetype
ARCHETYPE_QUESTION_AXES = {
    "autonomous_agent": {
        "dimensions": [
            "tool_invocation_policy",
            "max_recursion_depth",
            "memory_architecture",
            "retry_and_recovery",
            "sub_agent_spawning",
            "token_budget_allocation",
            "checkpoint_strategy",
            "safety_guardrails",
        ],
        "critical_questions": [
            "What tools/APIs can the agent invoke, and is there an approval step?",
            "What is the maximum recursion depth before the agent must stop?",
            "How should the agent manage memory — full conversation, sliding window, or summarization?",
            "When a tool call fails, should the agent retry, skip, or ask the user?",
            "Can this agent spawn sub-agents, and if so, what limits apply?",
            "Is there a token/cost budget per run, and what happens when it's exceeded?",
        ],
    },
    "workflow_engine": {
        "dimensions": [
            "concurrency_model",
            "rollback_policy",
            "state_persistence",
            "step_timeout",
            "conditional_branching",
            "human_in_the_loop",
            "idempotency",
        ],
        "critical_questions": [
            "Should workflow steps run sequentially, in parallel, or a mix?",
            "When a step fails, should the entire workflow rollback or skip and continue?",
            "How should workflow state be persisted — in-memory, database, or event log?",
            "Is there a timeout per step, and what happens when it fires?",
            "Are there conditional branches (if/else) in the workflow, or is it strictly linear?",
            "Do any steps require human approval before proceeding?",
        ],
    },
    "embedded_system": {
        "dimensions": [
            "hardware_target",
            "latency_requirements",
            "interrupt_model",
            "power_constraints",
            "memory_budget",
            "communication_protocol",
            "update_mechanism",
        ],
        "critical_questions": [
            "What is the target hardware (MCU, SBC, FPGA) and its memory/CPU constraints?",
            "What is the maximum acceptable latency for the critical path?",
            "Does the system use interrupt-driven I/O or polling?",
            "Are there power constraints (battery, sleep modes, duty cycling)?",
            "How will firmware/software be updated in the field?",
        ],
    },
    "saas_platform": {
        "dimensions": [
            "multi_tenancy_model",
            "billing_integration",
            "auth_provider",
            "data_isolation",
            "scaling_strategy",
            "compliance_requirements",
            "onboarding_flow",
        ],
        "critical_questions": [
            "Is this single-tenant or multi-tenant, and how is data isolated?",
            "What billing model — subscription, usage-based, freemium, or enterprise?",
            "What auth provider — OAuth, SAML, custom, or passwordless?",
            "Are there compliance requirements (GDPR, HIPAA, SOC2)?",
            "What is the expected scale — hundreds, thousands, or millions of users?",
        ],
    },
    "data_pipeline": {
        "dimensions": [
            "batch_vs_stream",
            "data_volume",
            "transformation_complexity",
            "error_recovery",
            "schema_evolution",
            "sink_destinations",
            "monitoring",
        ],
        "critical_questions": [
            "Is this batch processing, real-time streaming, or both?",
            "What is the expected data volume per day/hour?",
            "What are the data sources (databases, APIs, files, message queues)?",
            "How should schema changes be handled — fail, migrate, or ignore?",
            "Where does processed data land (data warehouse, API, file system, dashboard)?",
        ],
    },
    "cognitive_system": {
        "dimensions": [
            "model_stack",
            "retrieval_strategy",
            "knowledge_representation",
            "reasoning_chain_depth",
            "grounding_sources",
            "evaluation_metrics",
            "context_management",
        ],
        "critical_questions": [
            "What AI models are involved and do they chain together?",
            "Is there a retrieval/RAG component, and what is the knowledge source?",
            "How deep can reasoning chains go before the system must produce output?",
            "How is context managed across multi-turn interactions?",
            "What are the quality/accuracy requirements — best-effort or mission-critical?",
        ],
    },
    "compiler_toolchain": {
        "dimensions": [
            "source_language",
            "target_output",
            "error_reporting",
            "optimization_passes",
            "ast_representation",
            "plugin_extensibility",
        ],
        "critical_questions": [
            "What is the source language/format being parsed?",
            "What is the target output — machine code, bytecode, another language, or AST?",
            "How detailed should error messages and diagnostics be?",
            "Are there optimization passes, and which are critical?",
            "Should the toolchain support plugins or extensions?",
        ],
    },
    "realtime_system": {
        "dimensions": [
            "protocol",
            "connection_scale",
            "message_ordering",
            "presence_tracking",
            "offline_sync",
            "conflict_resolution",
        ],
        "critical_questions": [
            "What real-time protocol — WebSocket, SSE, WebRTC, or MQTT?",
            "How many concurrent connections do you expect?",
            "Is message ordering guaranteed, and does it matter for your use case?",
            "Do you need presence tracking (who's online/typing)?",
            "How should the system handle offline clients reconnecting?",
        ],
    },
    "marketplace": {
        "dimensions": [
            "participant_types",
            "matching_algorithm",
            "payment_escrow",
            "trust_and_reputation",
            "dispute_resolution",
            "search_and_discovery",
        ],
        "critical_questions": [
            "Who are the two sides of the marketplace (e.g., buyers/sellers, drivers/riders)?",
            "How are matches made — search, algorithm, auction, or manual?",
            "How are payments handled — direct, escrow, split?",
            "Is there a rating/reputation system, and how does it affect matching?",
            "How are disputes between participants resolved?",
        ],
    },
    "crud_app": {
        "dimensions": [
            "data_model_complexity",
            "access_control",
            "search_and_filter",
            "import_export",
            "audit_trail",
            "notifications",
        ],
        "critical_questions": [
            "How many core entities (tables/collections) does your data model have?",
            "What access control is needed — public, login-only, role-based, or row-level?",
            "Do you need full-text search or just basic filtering?",
            "Is data import/export (CSV, Excel, API) required?",
            "Do you need an audit trail of all changes?",
        ],
    },
}

CLARIFY_SYSTEM_PROMPT_TEMPLATE = """Role: Senior Architect interviewing for {archetype_display} in {domain}.

System Classification:
- Primary: {primary_archetype}
- Secondary: {secondary_archetype}
- Domain: {domain}
- Entity: {primary_entity}
- Path: {critical_path}
- Complexity: {complexity}

Generate 4-6 clarifying questions targeting these dimensions:
{dimension_list}

Examples:
{example_questions}

RULES:
1. Specific to archetype/domain.
2. Unlocks architectural decisions.
3. Skip answered questions.
4. >=1 "open_text" question.
5. Actionable options.

Types: "single_select" (3-5 options), "multi_select" (4-6 options), "open_text" ([]).

Respond ONLY with valid JSON:
{{
  "questions": [
    {{
      "id": "q1",
      "type": "single_select",
      "question": "?",
      "options": ["A", "B"]
    }}
  ]
}}"""


def generate_clarifying_questions(prompt: str, classification: dict = None) -> dict:
    """Stage 2: Generate domain-adaptive questions based on system classification.
    If classification is not provided, runs classifier first."""
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        return {"questions": []}

    # Run classifier if not provided
    if classification is None:
        classification = classify_system_type(prompt)

    archetype = classification.get("primary_archetype", "crud_app")
    secondary = classification.get("secondary_archetype")
    domain = classification.get("core_domain", "general")
    primary_entity = classification.get("primary_entity", "data")
    critical_path = classification.get("critical_path", "")
    complexity = classification.get("complexity_tier", "moderate")

    # Get archetype-specific question dimensions
    archetype_config = ARCHETYPE_QUESTION_AXES.get(archetype, ARCHETYPE_QUESTION_AXES["crud_app"])
    dimensions = archetype_config["dimensions"]
    examples = archetype_config["critical_questions"]

    # If there's a secondary archetype, merge its dimensions
    if secondary and secondary in ARCHETYPE_QUESTION_AXES:
        secondary_config = ARCHETYPE_QUESTION_AXES[secondary]
        dimensions = dimensions + secondary_config["dimensions"][:3]
        examples = examples + secondary_config["critical_questions"][:2]

    archetype_display = archetype.replace("_", " ").title()
    dimension_list = "\n".join(f"  - {d.replace('_', ' ').title()}" for d in dimensions)
    example_list = "\n".join(f"  - {q}" for q in examples)

    system_prompt = CLARIFY_SYSTEM_PROMPT_TEMPLATE.format(
        archetype_display=archetype_display,
        domain=domain,
        primary_archetype=archetype,
        secondary_archetype=secondary or "none",
        primary_entity=primary_entity,
        critical_path=critical_path,
        complexity=complexity,
        dimension_list=dimension_list,
        example_questions=example_list,
    )

    user_msg = f"""The user wants to build:
\"{prompt}\"

Generate 4-6 clarifying questions specific to this {archetype_display} system.
Probe the architectural dimensions that will have the biggest impact on the design."""

    try:
        print(f"[CLARIFY] Generating {archetype} questions for: {prompt[:60]}...")
        raw = _call_fast_model(system_prompt, user_msg, temperature=0.35)
        print(f"[CLARIFY] Got {len(raw)} chars")
        result = _extract_json(raw)

        # Attach the classification so frontend can display it
        result["classification"] = classification
        return result
    except Exception as e:
        print(f"ERROR: Clarification failed: {e}")
        traceback.print_exc()
        return {"questions": [], "classification": classification}


# ═══════════════════════════════════════════════════════════════
#  STAGE 3: REASONING-BASED ARCHITECTURE GENERATION
#
#  This is NOT "list modules."  It is a reasoning chain:
#    Intent → Constraints → Execution Flow → Failure Analysis → Architecture
#
#  The thinking model reasons about WHY each module exists before
#  generating the module list.
# ═══════════════════════════════════════════════════════════════

REASONING_SYSTEM_PROMPT = """You are an Enterprise Architecture Compiler.

Your job is NOT to generate generic architecture. Your job is to maintain architectural integrity across multiple model handoffs.

PRIMARY OBJECTIVE:
Preserve system continuity, execution fidelity, and platform constraints while transforming user intent into deployable modules.

GLOBAL RULES:

1. STATE PRESERVATION (MANDATORY)
Read and preserve the canonical architecture state object. Never reinterpret platform, execution environment, constraints, module boundaries, dependencies, ownership model, or governance model.

2. NO PLATFORM DRIFT
Do not substitute technologies. If external runtime is introduced, justify it.

3. MODULE CONTRACT ENFORCEMENT
Each module must contain exactly these fields:
- moduleId: Must follow format M001, M002, etc. (MANDATORY)
- label
- coreTask
- dataShape
- expectedOutput
- rules
- platform
- dependencies
- errorHandling
- testingRequirements

4. ARCHITECTURAL CONSISTENCY
Ensure security, observability, governance, and scaling assumptions remain intact.

5. SECURITY, OBSERVABILITY, GOVERNANCE
Security (RBAC, Audit Logging), Observability (latency, load times), and Governance (owners) must exist as separate operational layers in the text.

6. FAILURE MODEL & SCALABILITY
Address deep failure modes (timeout, schema drift, broken joins) and massive scale (100x data, multi-region).

7. OUTPUT DISCIPLINE (Pure Markdown)
Return strictly in this order:

## A. Reasoning
<Concise intent and constraints>

## B. Global Architecture Flow
```mermaid
graph TD
  M001[M001: Name] --> M002[M002: Name]
```

## C. Modules

### M001: <label>
**coreTask:** <desc>
**dataShape:** <desc>
**expectedOutput:** <desc>
**rules:** <desc>
**platform:** <desc>
**dependencies:** <desc>
**errorHandling:** <desc>
**testingRequirements:** <desc>

### M002: <label>
...

## D. Security Layer
<details>

## E. Governance Layer
<details>

## F. Observability Layer
<details>

## G. Failure Modes
<details>

## H. Scalability Risks
<details>

## I. Testing Matrix
<details>

RULES:
- Module IDs MUST use M001, M002 format.
- Output ONLY Markdown."""


def suggest_architecture(prompt: str, classification: dict = None, answers: dict = None) -> str:
    """Stage 3: Reasoning-based architecture generation.

    Uses the thinking model to reason about the architecture before
    generating the module list.  The reasoning chain is:
    Intent → Constraints → Flow → Failure Analysis → Architecture
    """
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        print("WARNING: No NVIDIA_API_KEY, returning mock architecture.")
        return "# Mock Architecture\n\n```mermaid\ngraph TD\nA-->B\n```\n\n## M001 Mock\n**Core Task:** Test"

    # Build rich context from classification + answers
    context_parts = [f'The user wants to build: "{prompt}"']

    if classification:
        context_parts.append(f"""
System Classification:
- Archetype: {classification.get('primary_archetype', 'unknown')}
- Secondary: {classification.get('secondary_archetype', 'none')}
- Domain: {classification.get('core_domain', 'general')}
- Primary Entity: {classification.get('primary_entity', 'data')}
- Critical Path: {classification.get('critical_path', 'unknown')}
- Complexity: {classification.get('complexity_tier', 'moderate')}""")

    if answers:
        answer_text = "\n".join(f"  Q: {k}\n  A: {v}" for k, v in answers.items())
        context_parts.append(f"\nUser's Answers to Clarifying Questions:\n{answer_text}")

    user_prompt = "\n".join(context_parts)
    user_prompt += """

Follow the full reasoning chain: Intent → Constraints → Flow → Failure Analysis → Architecture.
Generate the minimum modules needed in pure Markdown format."""

    try:
        print(f"[ARCH] Reasoning about architecture for: {prompt[:60]}...")

        # Use the thinking model for deep reasoning
        raw = _call_thinking_model(REASONING_SYSTEM_PROMPT, user_prompt)
        print(f"[ARCH] Got {len(raw)} chars from thinking model")

        result = _extract_json(raw)

        # Validate we got modules
        if "modules" not in result or len(result.get("modules", [])) == 0:
            print("WARNING: Thinking model returned no modules, retrying with fast model")
            raw = _call_fast_model(REASONING_SYSTEM_PROMPT, user_prompt, temperature=0.35, max_tokens=12000)
            result = _extract_json(raw)

        if "modules" not in result or len(result.get("modules", [])) == 0:
            print("WARNING: Both models failed, returning mock")
            return _mock_architecture(prompt)

        # Ensure all module fields are present
        for mod in result["modules"]:
            mod.setdefault("language", "Python")
            mod.setdefault("dependencies", "")
            mod.setdefault("errorHandling", "")
            mod.setdefault("testingRequirements", "")
            mod.setdefault("rules", "")
            mod.setdefault("dataShape", "")
            mod.setdefault("expectedOutput", "")

        # Validate connections reference real module IDs
        valid_ids = {m["id"] for m in result["modules"]}
        result["connections"] = [
            c for c in result.get("connections", [])
            if c.get("from_node") in valid_ids and c.get("to_node") in valid_ids
        ]

        # Detect and remove cycles
        result["connections"] = _remove_cycles(result["modules"], result["connections"])

        return result

    except Exception as e:
        print(f"ERROR: Architecture generation failed: {e}")
        traceback.print_exc()
        return _mock_architecture(prompt)


def suggest_architecture_stream(prompt: str, classification: dict = None, answers: dict = None):
    """Stage 3 (Streaming): Reasoning-based architecture generation.
    Yields Markdown tokens in real-time.
    """
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        yield "# Mock Architecture\n\nNo API Key available."
        return

    # Build rich context from classification + answers
    context_parts = [f'The user wants to build: "{prompt}"']

    if classification:
        context_parts.append(f"""
System Classification:
- Archetype: {classification.get('primary_archetype', 'unknown')}
- Secondary: {classification.get('secondary_archetype', 'none')}
- Domain: {classification.get('core_domain', 'general')}
- Primary Entity: {classification.get('primary_entity', 'data')}
- Critical Path: {classification.get('critical_path', 'unknown')}
- Complexity: {classification.get('complexity_tier', 'moderate')}""")

    if answers:
        answer_text = "\n".join(f"  Q: {k}\n  A: {v}" for k, v in answers.items())
        context_parts.append(f"\nUser's Answers to Clarifying Questions:\n{answer_text}")

    user_prompt = "\n".join(context_parts)
    user_prompt += """

Follow the full reasoning chain: Intent → Constraints → Flow → Failure Analysis → Architecture.
Generate the minimum modules needed in pure Markdown format."""

    try:
        print(f"[ARCH-STREAM] Reasoning about architecture for: {prompt[:60]}...")
        # Yield tokens directly from the model
        for chunk in _call_thinking_model_stream(REASONING_SYSTEM_PROMPT, user_prompt):
            yield chunk
    except Exception as e:
        print(f"ERROR: Streaming architecture generation failed: {e}")
        traceback.print_exc()
        yield f"\n\n**Error:** {str(e)}"


def extract_graph_json(markdown_text: str) -> dict:
    """Extracts React Flow JSON out of the raw Markdown text."""
    system_prompt = """You are a strict JSON extractor. Read the provided Markdown text which contains an Enterprise Architecture.

CRITICAL RULES:
1. Parse ONLY the `## C. Modules` section.
2. Completely IGNORE all other sections (Reasoning, Flowchart, Security, Governance, Observability, etc.).
3. Preserve all mandatory module fields EXACTLY as written.
4. Enforce deterministic module IDs (M001, M002, etc.). Do not generate arbitrary IDs or rename them.
5. Edge generation rules: Generate edges ONLY from the explicit sequential ordering of the modules (M001 -> M002 -> M003). Do not infer edges from the reasoning text or create cross-links.

Extract the modules and connections exactly into this JSON schema:
{
  "modules": [
    {
      "id": "M001",
      "name": "Label from the markdown (e.g. Ingestion Layer)",
      "coreTask": "Task description",
      "dataShape": "Data shape",
      "expectedOutput": "Expected output",
      "rules": "Rules",
      "platform": "Platform",
      "dependencies": "Dependencies",
      "errorHandling": "Error handling",
      "testingRequirements": "Testing requirements"
    }
  ],
  "connections": [
    {"from_node": "M001", "to_node": "M002"}
  ]
}
Return ONLY valid JSON, no markdown fences."""
    
    try:
        raw = _call_fast_model(system_prompt, markdown_text, temperature=0.1, json_mode=True)
        result = _extract_json(raw)
        
        # Ensure fields exist
        for mod in result.get("modules", []):
            mod.setdefault("platform", "Unknown")
            # Backward compatibility alias for the legacy frontend schema
            if "language" not in mod or not mod["language"]:
                mod["language"] = mod.get("platform")
            mod.setdefault("dependencies", "None")
            mod.setdefault("errorHandling", "None specified")
            mod.setdefault("testingRequirements", "None specified")
            mod.setdefault("rules", "None specified")
            mod.setdefault("dataShape", "Unknown")
            mod.setdefault("expectedOutput", "Unknown")
            
        return result
    except Exception as e:
        print(f"ERROR: Extract graph JSON failed: {e}")
        traceback.print_exc()
        return {"modules": [], "connections": []}


def _remove_cycles(modules: list, connections: list) -> list:
    """Detect and remove edges that would create cycles in the DAG."""
    adj = {m["id"]: [] for m in modules}
    valid_connections = []

    for conn in connections:
        src = conn["from_node"]
        tgt = conn["to_node"]

        # Skip self-loops
        if src == tgt:
            continue

        # Temporarily add edge and check for cycle
        adj[src].append(tgt)
        if _has_cycle(adj, modules):
            adj[src].remove(tgt)
            print(f"[ARCH] Removed cyclic edge: {src} → {tgt}")
        else:
            valid_connections.append(conn)

    return valid_connections


def _has_cycle(adj: dict, modules: list) -> bool:
    """DFS-based cycle detection."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {m["id"]: WHITE for m in modules}

    def dfs(node):
        color[node] = GRAY
        for neighbor in adj.get(node, []):
            if color.get(neighbor) == GRAY:
                return True
            if color.get(neighbor) == WHITE and dfs(neighbor):
                return True
        color[node] = BLACK
        return False

    for m in modules:
        if color[m["id"]] == WHITE:
            if dfs(m["id"]):
                return True
    return False


def _mock_architecture(prompt: str) -> dict:
    """Fallback mock with reasoning."""
    return {
        "reasoning": {
            "intent": f"Build a system for: {prompt}",
            "constraints": ["No API key available — mock response"],
            "execution_flow": "Input → Process → Output",
            "failure_modes": ["Cannot determine without real analysis"],
            "design_decisions": ["Using minimal 3-module mock architecture"],
        },
        "modules": [
            {
                "id": "m1",
                "name": "Request Handler",
                "coreTask": f"Receives and validates incoming requests for: {prompt}. Parses raw input, normalizes fields, checks required data is present before passing downstream.",
                "dataShape": "{ raw_input: str|dict, request_id: str(uuid), timestamp: int(epoch_ms) }",
                "expectedOutput": "{ validated_payload: dict, request_id: str, is_valid: bool, errors: list<str> }",
                "rules": "Reject payloads > 1MB. Snake_case all field names.",
                "language": "Node.js",
                "dependencies": "express>=4.18.0, joi>=17.9.0, uuid>=9.0.0",
                "errorHandling": "Throw ValidationError if required fields missing. Throw PayloadTooLargeError if body > 1MB.",
                "testingRequirements": "Valid input passes, Missing field returns error, Oversized payload rejected, Malformed JSON returns 400",
            },
            {
                "id": "m2",
                "name": "Core Processor",
                "coreTask": "Applies the main business transformation to validated input. Executes domain-specific rules and produces the processed result.",
                "dataShape": "{ validated_payload: dict, request_id: str }",
                "expectedOutput": "{ processed_result: dict, processing_time_ms: int, status: str(success|partial|failed) }",
                "rules": "Must be idempotent. Log every transformation step.",
                "language": "Python",
                "dependencies": "pydantic>=2.0.0",
                "errorHandling": "Raise ProcessingError on invalid state. Raise TimeoutError after 30s.",
                "testingRequirements": "Valid data succeeds, Invalid state raises error, Idempotency verified, Timeout enforced",
            },
            {
                "id": "m3",
                "name": "Response Formatter",
                "coreTask": "Formats processed results into the final API response. Adds metadata, timestamps, and pagination.",
                "dataShape": "{ processed_result: dict, request_id: str, status: str }",
                "expectedOutput": "{ response_body: dict, http_status: int, headers: dict<str,str> }",
                "rules": "Always include request_id. ISO 8601 timestamps.",
                "language": "Node.js",
                "dependencies": "dayjs>=1.11.0",
                "errorHandling": "Raise FormatError if result missing keys. Return 500 on unexpected shapes.",
                "testingRequirements": "Success returns 200, Failure returns error code, request_id present, Timestamps valid",
            },
        ],
        "connections": [
            {"from_node": "m1", "to_node": "m2"},
            {"from_node": "m2", "to_node": "m3"},
        ],
    }


# ═══════════════════════════════════════════════════════════════
#  STAGE 4: ADVERSARIAL ARCHITECTURE REVIEW
#
#  This is NOT "score the architecture."  It is:
#    "What can fail?  What can loop?  What can deadlock?
#     What can duplicate?  What can overload?"
# ═══════════════════════════════════════════════════════════════

MODULE_REVIEW_PROMPT = """You are an architecture reviewer analyzing a single software module.
Your job is to review its definition, evaluate its robustness, and point out logic flaws, missing edge cases, or interface mismatches.

Respond with ONLY valid JSON:
{
  "score": 85,
  "issues": [
    {"type": "errorHandling", "description": "Missing timeout handling for external API."}
  ],
  "suggestions": [
    "Add idempotency key to expectedOutput."
  ]
}
"""


def review_single_module(module_data: dict) -> dict:
    """Perform a localized review on a single module."""
    import os, json, traceback
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        return {"score": 80, "issues": [{"type": "auth", "description": "No API Key"}], "suggestions": []}
    
    prompt = f"Review this module:\n{json.dumps(module_data, indent=2)}\nAnalyze and return JSON review."
    try:
        raw = _call_fast_model(MODULE_REVIEW_PROMPT, prompt, temperature=0.2, max_tokens=1024, json_mode=True)
        review = _extract_json(raw)
        return review
    except Exception as e:
        traceback.print_exc()
        return {"score": 50, "issues": [{"type": "error", "description": str(e)}], "suggestions": []}


# ═══════════════════════════════════════════════════════════════
#  STAGE 5: INTELLIGENT OPTIMIZATION
#
#  Not just "merge duplicates."  Enforce:
#    - Redundancy collapse (merge modules with >80% overlap)
#    - Dependency simplification (reduce cross-module coupling)
#    - Deterministic execution paths (remove ambiguous edges)
#    - Graph compression (minimize depth without losing function)
# ═══════════════════════════════════════════════════════════════

OPTIMIZE_SYSTEM_PROMPT = """You are an architecture optimizer performing GRAPH COMPRESSION.

You will receive modules, connections, and existing capabilities.
Your job is to make the graph SMALLER and SIMPLER without losing functionality.

OPTIMIZATION PASSES (execute in order):

━━━ PASS 1: REDUNDANCY COLLAPSE ━━━
Find modules with >80% responsibility overlap.  Merge them.
Keep the module with the better specification.  Redirect all edges.

━━━ PASS 2: INFRASTRUCTURE EXTRACTION ━━━
Convert cross-cutting infrastructure modules to capabilities:
  Auth, Logging, Monitoring, Rate Limiting, Caching, Error Handling,
  Encryption, CORS, Input Validation (generic)
NEVER convert business logic to capabilities:
  Dashboards, Payments, Search, User Profiles, Reports, Notifications = MODULES.

━━━ PASS 3: ORPHAN REMOVAL ━━━
Remove modules with zero connections (unless ≤2 modules total).

━━━ PASS 4: DEPENDENCY SIMPLIFICATION ━━━
If module A → B → C, and B does trivial pass-through, propose merging A+B or B+C.
Minimize graph depth without losing distinct transformations.

━━━ PASS 5: MISSING CAPABILITIES ━━━
Add any critical platform capabilities not yet in the list.

CONSTRAINTS:
- This is CLEANUP ONLY.  Do NOT add new business modules.
- If the graph is already clean, return empty arrays.
- Only reference IDs that exist in the input.

Respond with ONLY valid JSON:
{
  "merges": [{"duplicateId": "<id to remove>", "keepId": "<id to keep>"}],
  "conversionsToCapabilities": [{"moduleId": "<id>", "capability": "<name>"}],
  "deletions": ["<orphan id>"],
  "newCapabilities": ["<capability>"],
  "reasoning": "<brief explanation of what you optimized and why>"
}"""


def auto_improve_architecture(graph_data: dict, instruction: str = None) -> dict:
    """Stage 5: Intelligent graph optimization."""
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise ValueError("NVIDIA_API_KEY environment variable is not set.")

    existing_nodes = graph_data.get("nodes", [])
    existing_edges = graph_data.get("edges", [])
    capabilities = list(graph_data.get("projectCapabilities", []))

    module_summary = []
    for n in existing_nodes:
        d = n.get("data", {})
        module_summary.append({
            "id": n.get("id"),
            "name": d.get("label", ""),
            "coreTask": d.get("coreTask", ""),
        })

    connections = [
        {"from": e.get("source"), "to": e.get("target")}
        for e in existing_edges
    ]

    instruction_text = f"\nUser instruction: {instruction}\n" if instruction else ""

    prompt = f"""{instruction_text}
MODULES:
{json.dumps(module_summary, indent=2)}

CONNECTIONS:
{json.dumps(connections, indent=2)}

EXISTING CAPABILITIES:
{json.dumps(capabilities)}

Optimize this graph.  Only reference IDs from MODULES above."""

    try:
        print(f"[OPTIMIZE] Compressing graph ({len(module_summary)} nodes)...")
        raw = _call_fast_model(OPTIMIZE_SYSTEM_PROMPT, prompt, temperature=0.15, json_mode=True)
        print(f"[OPTIMIZE] Got {len(raw)} chars")

        delta = _extract_json(raw)
        real_ids = {m["id"] for m in module_summary}

        # Validate all references
        delta["merges"] = [
            m for m in delta.get("merges", [])
            if m.get("duplicateId") in real_ids and m.get("keepId") in real_ids
        ]
        delta["conversionsToCapabilities"] = [
            c for c in delta.get("conversionsToCapabilities", [])
            if c.get("moduleId") in real_ids
        ]
        delta["deletions"] = [
            d for d in delta.get("deletions", []) if d in real_ids
        ]

        # Apply delta to graph
        for merge in delta.get("merges", []):
            dup_id, keep_id = merge["duplicateId"], merge["keepId"]
            for e in existing_edges:
                if e.get("source") == dup_id: e["source"] = keep_id
                if e.get("target") == dup_id: e["target"] = keep_id
            existing_nodes = [n for n in existing_nodes if n.get("id") != dup_id]

        for conv in delta.get("conversionsToCapabilities", []):
            mod_id, cap = conv["moduleId"], conv.get("capability", "")
            if cap and cap not in capabilities:
                capabilities.append(cap)
            existing_nodes = [n for n in existing_nodes if n.get("id") != mod_id]
            existing_edges = [e for e in existing_edges if e.get("source") != mod_id and e.get("target") != mod_id]

        for del_id in delta.get("deletions", []):
            existing_nodes = [n for n in existing_nodes if n.get("id") != del_id]
            existing_edges = [e for e in existing_edges if e.get("source") != del_id and e.get("target") != del_id]

        for cap in delta.get("newCapabilities", []):
            if cap and cap not in capabilities:
                capabilities.append(cap)

        # Remove self-loops
        existing_edges = [e for e in existing_edges if e.get("source") != e.get("target")]

        # Reconstruct output
        output_modules = []
        for n in existing_nodes:
            d = n.get("data", {})
            output_modules.append({
                "id": n.get("id"),
                "name": d.get("label", ""),
                "coreTask": d.get("coreTask", ""),
                "dataShape": d.get("dataShape", ""),
                "expectedOutput": d.get("expectedOutput", ""),
                "rules": d.get("rules", ""),
                "language": d.get("language", "Python"),
                "dependencies": d.get("dependencies", ""),
                "errorHandling": d.get("errorHandling", ""),
                "testingRequirements": d.get("testingRequirements", ""),
            })

        output_connections = [
            {"from_node": e.get("source"), "to_node": e.get("target")}
            for e in existing_edges
        ]

        return {
            "modules": output_modules,
            "connections": output_connections,
            "capabilities": capabilities,
            "delta": delta,
        }

    except Exception as e:
        print(f"ERROR: Optimization failed: {e}")
        traceback.print_exc()
        raise


# ═══════════════════════════════════════════════════════════════
#  EXPAND & BATCH EXPAND  (add modules to existing graph)
# ═══════════════════════════════════════════════════════════════



EXPAND_SYSTEM_PROMPT = """You are a Software Architect adding a NEW module to an existing system.

You receive:
  1. Existing modules with IDs
  2. Existing connections
  3. Name and reason for the new module

YOUR JOBS:
1. Design the module with COMPLETE specifications.
2. Choose connections: which existing modules feed INTO it (connect_from)
   and which it feeds OUT TO (connect_to).
3. Pick a unique ID ("m_new_1") not conflicting with existing IDs.
4. Choose the BEST language for this task.
5. Ensure the new module doesn't create a cycle in the graph.

IMPORTANT:
- connect_from/connect_to MUST only contain IDs from the existing list.
- Fill EVERY field with real content.

Respond with ONLY valid JSON:
{
  "new_module": {
    "id": "m_new_1",
    "name": "<name>",
    "coreTask": "<2-3 sentences>",
    "dataShape": "<keys with types>",
    "expectedOutput": "<keys with types>",
    "rules": "<constraints>",
    "language": "<best language>",
    "dependencies": "<real packages>",
    "errorHandling": "<2-3 exception scenarios>",
    "testingRequirements": "<3-5 test cases>"
  },
  "connect_from": ["<existing_id>"],
  "connect_to": ["<existing_id>"]
}"""


def expand_architecture(graph_data: dict, module_name: str, reason: str) -> dict:
    """Adds a single new module with validated connections."""
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise ValueError("NVIDIA_API_KEY environment variable is not set.")

    existing_nodes = graph_data.get("nodes", [])
    existing_edges = graph_data.get("edges", [])
    existing_ids = {n.get("id") for n in existing_nodes}

    module_summary = []
    for n in existing_nodes:
        d = n.get("data", {})
        module_summary.append({
            "id": n.get("id"),
            "name": d.get("label", ""),
            "coreTask": d.get("coreTask", ""),
            "expectedOutput": d.get("expectedOutput", ""),
        })

    connections = [{"from": e.get("source"), "to": e.get("target")} for e in existing_edges]

    prompt = f"""EXISTING MODULES (use ONLY these IDs):
{json.dumps(module_summary, indent=2)}

CONNECTIONS:
{json.dumps(connections, indent=2)}

NEW MODULE:
- Name: {module_name}
- Reason: {reason}

Design with full detail.  Only use existing IDs for connections."""

    try:
        print(f"[EXPAND] Designing '{module_name}'...")
        raw = _call_fast_model(EXPAND_SYSTEM_PROMPT, prompt, temperature=0.3, json_mode=True)
        result = _extract_json(raw)

        new_mod = result.get("new_module", {})
        valid_from = [s for s in result.get("connect_from", []) if s in existing_ids]
        valid_to = [t for t in result.get("connect_to", []) if t in existing_ids]

        if not valid_from and not valid_to and existing_nodes:
            valid_from = [existing_nodes[-1].get("id")]

        new_connections = []
        for src in valid_from:
            new_connections.append({"from_node": src, "to_node": new_mod["id"]})
        for tgt in valid_to:
            new_connections.append({"from_node": new_mod["id"], "to_node": tgt})

        return {"new_module": new_mod, "new_connections": new_connections}

    except Exception as e:
        print(f"ERROR: Expand failed: {e}")
        traceback.print_exc()
        raise


async def async_expand_architecture(graph_data: dict, module_name: str, reason: str) -> dict:
    """Adds a single new module asynchronously."""
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise ValueError("NVIDIA_API_KEY environment variable is not set.")

    existing_nodes = graph_data.get("nodes", [])
    existing_edges = graph_data.get("edges", [])
    existing_ids = {n.get("id") for n in existing_nodes}

    module_summary = []
    for n in existing_nodes:
        d = n.get("data", {})
        module_summary.append({
            "id": n.get("id"),
            "name": d.get("label", ""),
            "coreTask": d.get("coreTask", ""),
            "expectedOutput": d.get("expectedOutput", ""),
        })

    connections = [{"from": e.get("source"), "to": e.get("target")} for e in existing_edges]

    prompt = f"""EXISTING MODULES (use ONLY these IDs):
{json.dumps(module_summary, indent=2)}

CONNECTIONS:
{json.dumps(connections, indent=2)}

NEW MODULE:
- Name: {module_name}
- Reason: {reason}

Design with full detail.  Only use existing IDs for connections."""

    try:
        print(f"[EXPAND ASYNC] Designing '{module_name}'...")
        raw = await _async_call_fast_model(EXPAND_SYSTEM_PROMPT, prompt, temperature=0.3, json_mode=True)
        result = _extract_json(raw)

        new_mod = result.get("new_module", {})
        valid_from = [s for s in result.get("connect_from", []) if s in existing_ids]
        valid_to = [t for t in result.get("connect_to", []) if t in existing_ids]

        if not valid_from and not valid_to and existing_nodes:
            valid_from = [existing_nodes[-1].get("id")]

        new_connections = []
        for src in valid_from:
            new_connections.append({"from_node": src, "to_node": new_mod["id"]})
        for tgt in valid_to:
            new_connections.append({"from_node": new_mod["id"], "to_node": tgt})

        return {"new_module": new_mod, "new_connections": new_connections}

    except Exception as e:
        print(f"ERROR: Async Expand failed: {e}")
        traceback.print_exc()
        raise


async def batch_expand_architecture(graph_data: dict, modules_to_add: list) -> dict:
    """Generates multiple modules concurrently."""
    import asyncio
    all_new_modules = []
    all_new_connections = []
    
    tasks = []
    for item in modules_to_add:
        tasks.append(async_expand_architecture(graph_data, item["name"], item.get("reason", "Required")))
        
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # We must construct a completely new graph to avoid mutating the input while iterating
    current_graph = {
        "nodes": list(graph_data.get("nodes", [])),
        "edges": list(graph_data.get("edges", [])),
    }

    for item in modules_to_add:
        try:
            result = expand_architecture(current_graph, item["name"], item.get("reason", "Required"))
            nm = result["new_module"]
            all_new_modules.append(nm)
            all_new_connections.extend(result["new_connections"])

            current_graph["nodes"].append({
                "id": nm["id"],
                "data": {
                    "label": nm.get("name", ""),
                    "coreTask": nm.get("coreTask", ""),
                    "dataShape": nm.get("dataShape", ""),
                    "expectedOutput": nm.get("expectedOutput", ""),
                    "language": nm.get("language", "Python"),
                },
            })
            for conn in result["new_connections"]:
                current_graph["edges"].append({"source": conn["from_node"], "target": conn["to_node"]})

        except Exception as e:
            print(f"WARNING: Failed to expand '{item.get('name')}': {e}")
            continue

    return {"new_modules": all_new_modules, "new_connections": all_new_connections}


# ═══════════════════════════════════════════════════════════════
#  CODE GENERATION & FLOWCHART  (per-module tools)
# ═══════════════════════════════════════════════════════════════

CODE_GENERATION_SYSTEM_PROMPT = """You are an expert developer writing a module for the EasePr framework.
Write ONLY raw source code.  No markdown.  No explanations.

RULES:
1. File must contain: def run(state: dict) -> dict
2. Extract inputs with .get() and sensible defaults.
3. Validate required inputs — raise ValueError with clear messages.
4. Implement ACTUAL logic, not stubs.
5. Return dict with EXACTLY the keys from "Expected Output".
6. Include try/except for external calls.
7. Brief inline comments for non-obvious logic.
8. Type hints on helper functions.
9. Import dependencies at top.
10. NO placeholders, NO "TODO", NO "pass"."""


def generate_module_code(module_spec: dict, base_dir: str = "modules"):
    """Generate implementation.py and metadata.json for a module."""
    api_key = os.environ.get("NVIDIA_API_KEY")

    if not api_key:
        _save_module(module_spec, _mock_code(module_spec), base_dir)
        return

    user_prompt = f"""MODULE: {module_spec.get('name')}
LANGUAGE: {module_spec.get('language', 'Python')}
CORE TASK: {module_spec.get('coreTask')}
INPUT: {module_spec.get('dataShape')}
OUTPUT: {module_spec.get('expectedOutput')}
RULES: {module_spec.get('rules')}
DEPS: {module_spec.get('dependencies')}
ERRORS: {module_spec.get('errorHandling')}
TESTS: {module_spec.get('testingRequirements')}

Write a complete def run(state: dict) -> dict function.  Raw Python only."""

    try:
        raw = _call_thinking_model(CODE_GENERATION_SYSTEM_PROMPT, user_prompt)
        code = raw.strip()
        if code.startswith("```"):
            code = code.split("\n", 1)[1]
            if code.endswith("```"):
                code = code[:-3]
            code = code.strip()
        _save_module(module_spec, code, base_dir)
    except Exception as e:
        print(f"ERROR: Code gen failed for {module_spec.get('name')}: {e}")
        _save_module(module_spec, _mock_code(module_spec), base_dir)


FLOWCHART_SYSTEM_PROMPT = """Generate a Mermaid.js flowchart (graph TD) for a module's internal logic.
ONLY raw Mermaid code.  No markdown fences.  Start with: graph TD
Include validation, processing, error paths.  6-15 nodes."""


def generate_logic_flowchart(module_spec: dict) -> str:
    """Generate Mermaid.js flowchart for a module's logic."""
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        return "graph TD\n    Start([Start]) --> Validate{Valid?}\n    Validate -- Yes --> Process[Process]\n    Validate -- No --> Error[Error]\n    Process --> End([End])\n    Error --> End"

    prompt = f"""MODULE: {module_spec.get('name', module_spec.get('coreTask', ''))}
TASK: {module_spec.get('coreTask')}
INPUT: {module_spec.get('dataShape')}
OUTPUT: {module_spec.get('expectedOutput')}
ERRORS: {module_spec.get('errorHandling')}"""

    try:
        raw = _call_fast_model(FLOWCHART_SYSTEM_PROMPT, prompt, temperature=0.2, max_tokens=1500)
        chart = raw.strip()
        if chart.startswith("```"):
            chart = chart.split("\n", 1)[1]
            if chart.endswith("```"):
                chart = chart[:-3]
            chart = chart.strip()
        if not chart.startswith("graph"):
            chart = "graph TD\n" + chart
        return chart
    except Exception as e:
        print(f"ERROR: Flowchart failed: {e}")
        return "graph TD\n    A([Start]) --> B[Process] --> C([End])"


def _mock_code(spec: dict) -> str:
    name = spec.get("name", "Module")
    return f'''def run(state: dict) -> dict:
    """{name}: {spec.get("coreTask", "Process data.")}"""
    if not state:
        raise ValueError("State cannot be empty")
    result = dict(state)
    result["_{name.lower().replace(" ", "_")}_done"] = True
    return result
'''


def _save_module(module_spec: dict, code: str, base_dir: str):
    folder = module_spec.get("name", "unnamed").lower().replace(" ", "_")
    path = os.path.join(base_dir, folder)
    os.makedirs(path, exist_ok=True)

    meta = {k: module_spec.get(k, "") for k in [
        "name", "coreTask", "dataShape", "expectedOutput", "rules",
        "language", "dependencies", "errorHandling", "testingRequirements",
    ]}

    with open(os.path.join(path, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=4)
    with open(os.path.join(path, "implementation.py"), "w") as f:
        f.write(code)

def chat_update_module(module_data: dict, user_message: str) -> dict:
    """Updates a single module's spec interactively via chat request."""
    system_prompt = """You are an AI Architect assistant updating a single module specification.
You will be provided with the CURRENT JSON state of a module, and a user's REQUEST to change it.
Your task is to return ONLY valid JSON representing the fully updated module. Do NOT wrap it in markdown.
Keep the structure identical, but modify the fields according to the user's intent. Do not remove existing fields unless requested."""
    
    user_prompt = f"CURRENT MODULE STATE:\n{json.dumps(module_data, indent=2)}\n\nUSER REQUEST:\n{user_message}"
    
    try:
        raw = _call_fast_model(system_prompt, user_prompt, temperature=0.2, json_mode=True)
        return _extract_json(raw)
    except Exception as e:
        print(f"ERROR: Module chat update failed: {e}")
        traceback.print_exc()
        return module_data

def chat_update_module_stream(module_data: dict, user_message: str):
    """Yields streaming chunks of AI reasoning, ending with a JSON block of the updated module."""
    system_prompt = """You are an AI Architect assistant updating a single module specification.
You will be provided with the CURRENT JSON state of a module, and a user's REQUEST to change it.
First, explain how you will modify the module based on the request in exactly a concise 2-sentence summary.
Then, output EXACTLY ONE JSON block wrapped in ```json ... ``` that contains the fully updated module.
Keep the JSON structure identical, but modify the fields according to the user's intent. Do not remove existing fields unless requested.
Your final output must be the JSON block."""
    
    user_prompt = f"CURRENT MODULE STATE:\n{json.dumps(module_data, indent=2)}\n\nUSER REQUEST:\n{user_message}"
    
    try:
        print(f"[CHAT-STREAM] Reasoning about module update...")
        for chunk in _call_thinking_model_stream(system_prompt, user_prompt):
            yield chunk
    except Exception as e:
        print(f"ERROR: Module chat streaming failed: {e}")
        traceback.print_exc()
        yield f"\n\n**Error:** {str(e)}"
