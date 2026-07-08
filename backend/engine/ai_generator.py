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

    try:
        response = client.chat.completions.create(**kwargs)
    except Exception as e:
        print(f"THINKING_MODEL ({THINKING_MODEL}) failed: {e}. Falling back to FAST_MODEL ({FAST_MODEL})...")
        kwargs["model"] = FAST_MODEL
        if "extra_body" in kwargs:
            del kwargs["extra_body"]
        kwargs["temperature"] = 0.7
        kwargs["top_p"] = 1.0
        response = client.chat.completions.create(**kwargs)
    
    # Try to extract reasoning content if present
    message = response.choices[0].message
    reasoning = getattr(message, "reasoning_content", "") or ""
    content = message.content or ""
    
    if json_mode:
        final_response = content.strip()
    else:
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
        
    try:
        stream = client.chat.completions.create(**kwargs)
    except Exception as e:
        print(f"THINKING_MODEL stream ({THINKING_MODEL}) failed: {e}. Falling back to FAST_MODEL ({FAST_MODEL})...")
        yield f"\n\n> **Notice:** The primary reasoning model is currently degraded. Falling back to the fast model ({FAST_MODEL}) for generation.\n\n"
        kwargs["model"] = FAST_MODEL
        if "extra_body" in kwargs:
            del kwargs["extra_body"]
        kwargs["temperature"] = 0.7
        kwargs["top_p"] = 1.0
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

CLASSIFIER_SYSTEM_PROMPT = """You are a System Architecture Classifier. Your task is to analyze a project description and determine its architectural archetype.

ARCHETYPES (pick ONE primary, optionally ONE secondary):
- crud_app: Standard data management — forms, admin panels, dashboards, simple REST APIs with CRUD operations on a database.
- saas_platform: Multi-tenant cloud product — user management, billing/subscriptions, tenant isolation, onboarding flows.
- autonomous_agent: AI-driven autonomous system — LLM agents that invoke tools, manage memory, recurse, and make decisions without human input per step.
- workflow_engine: Multi-step orchestration — DAGs, state machines, approval chains, pipelines with conditional branching and rollback.
- embedded_system: Hardware-coupled software — IoT devices, MCUs, real-time constraints, interrupt-driven I/O, firmware updates.
- compiler_toolchain: Language processing — parsers, lexers, ASTs, code generation, interpreters, transpilers, linters.
- data_pipeline: Data movement & transformation — ETL/ELT, batch processing, stream processing, schema evolution, data lakes.
- cognitive_system: Multi-model AI system — RAG pipelines, reasoning chains, multi-model orchestration, knowledge graphs, embeddings.
- realtime_system: Low-latency bidirectional communication — WebSocket/SSE/WebRTC, chat, live collaboration, gaming, presence tracking.
- marketplace: Two-sided platform — matching buyers/sellers, search/discovery, escrow payments, ratings/reputation, dispute resolution.

DISAMBIGUATION RULES:
- If the system has AI/LLM components AND a user-facing product, prefer the product archetype as primary and the AI archetype as secondary.
- If the system is primarily about moving/transforming data, choose data_pipeline even if it uses AI for enrichment.
- If unsure between two, pick the one that defines the HARDEST architectural constraint.

COMPLEXITY TIERS:
- simple: Single user, single database, <5 entities, no auth complexity.
- moderate: Multi-user, role-based access, 5-15 entities, standard integrations.
- complex: Multi-service, event-driven, 15+ entities, external API dependencies, caching layers.
- enterprise: Multi-region, compliance requirements (GDPR/HIPAA/SOC2), SLA guarantees, multi-tenant data isolation.

Respond with ONLY valid JSON:
{
  "primary_archetype": "<archetype>",
  "secondary_archetype": "<archetype|null>",
  "core_domain": "<1-3 word domain, e.g. 'fintech', 'healthcare', 'e-commerce'>",
  "primary_entity": "<the central data object users interact with>",
  "critical_path": "<the single most important user journey, 1 sentence>",
  "complexity_tier": "<simple|moderate|complex|enterprise>",
  "reasoning": "<2-3 sentences explaining WHY this archetype and not the alternatives>"
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
        raw = _call_fast_model(CLASSIFIER_SYSTEM_PROMPT, prompt, temperature=0.3, json_mode=True)
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

CLARIFY_SYSTEM_PROMPT_TEMPLATE = """You are a Principal Architect conducting a technical requirements interview for a {archetype_display} system in the {domain} domain.

SYSTEM CONTEXT:
- Primary Archetype: {primary_archetype}
- Secondary Archetype: {secondary_archetype}
- Core Domain: {domain}
- Central Entity: {primary_entity}
- Critical User Journey: {critical_path}
- Complexity Tier: {complexity}

YOUR TASK:
Generate exactly 5 clarifying questions that will UNLOCK specific architectural decisions. Each question must directly impact how the system is built.

QUESTION DESIGN RULES:
1. NEVER ask yes/no questions. Every question must offer 3+ concrete architectural alternatives.
2. NEVER re-ask something the user already stated in their original prompt. Extract what they already told you and skip those dimensions.
3. Every option must be a SPECIFIC technical choice (e.g., "Use Redis with TTL-based eviction" not "Use caching").
4. At least 1 question must be "open_text" type — phrase it as "Describe the specific..." not "Tell me about..."
5. Questions must target these architectural dimensions:
{dimension_list}

6. Order questions from MOST impactful to LEAST impactful on the architecture.

REFERENCE EXAMPLES (adapt to the user's specific project, do NOT copy verbatim):
{example_questions}

RESPONSE FORMAT — respond with ONLY valid JSON:
{{{{
  "questions": [
    {{{{
      "id": "q1",
      "type": "single_select",
      "question": "<specific question about THIS project>",
      "options": ["<concrete option A>", "<concrete option B>", "<concrete option C>"],
      "architectural_impact": "<1 sentence: what design decision this unlocks>"
    }}}}
  ]
}}}}

QUESTION TYPES:
- "single_select": Exactly ONE choice from 3-5 options.
- "multi_select": Pick 1+ from 4-6 options.
- "open_text": Free-form answer (options array must be empty [])."""


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
        raw = _call_fast_model(system_prompt, user_msg, temperature=0.35, json_mode=True)
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

REASONING_SYSTEM_PROMPT = """You are an Enterprise Architecture Compiler. You transform user intent into a precise, deployable module graph.

YOUR REASONING CHAIN (follow this exact order):
1. INTENT ANALYSIS: What is the user actually trying to build? What problem does it solve?
2. CONSTRAINT EXTRACTION: What are the hard technical constraints (scale, latency, compliance, integrations)?
3. EXECUTION FLOW: What is the critical data path from input to output?
4. FAILURE ANALYSIS: What are the top 3 ways this system can fail catastrophically?
5. MODULE DECOMPOSITION: Based on 1-4, what are the minimum modules needed?

MODULE COUNT GUIDELINES:
- simple complexity: 3-5 modules
- moderate complexity: 5-8 modules
- complex complexity: 8-12 modules
- enterprise complexity: 10-15 modules
Never exceed 15 modules. If you need more, you are not abstracting enough.

MODULE CONTRACT — every module MUST have these fields with SUBSTANTIVE content:
- id: Sequential format M001, M002, M003... (MANDATORY)
- name: Clear, specific name (e.g., "Payment Processing Gateway" not "Payments")
- coreTask: 2-3 sentences describing EXACTLY what this module does. Include the primary algorithm or process, not just "handles X".
- dataShape: Explicit input schema with types. Example: "{ order_id: string(uuid), items: list<{sku: string, qty: int, price: float}>, customer_id: string }"
- expectedOutput: Explicit output schema with types. Example: "{ payment_id: string(uuid), status: enum(success|failed|pending), receipt_url: string(url) }"
- rules: Hard constraints this module enforces. Example: "Max 50 items per order. Price must be > 0. Idempotent on order_id."
- platform: Primary technology. Example: "FastAPI + SQLAlchemy + PostgreSQL"
- language: Primary programming language. Example: "Python"
- dependencies: Specific packages with minimum versions. Example: "stripe>=7.0.0, sqlalchemy>=2.0.0, pydantic>=2.0.0"
- errorHandling: 2-3 specific exception scenarios with recovery actions. Example: "StripeCardDeclinedError -> retry once then mark failed. TimeoutError after 30s -> queue for async retry."
- testingRequirements: 3-5 specific test cases. Example: "Valid order succeeds, Duplicate order_id is idempotent, Negative price rejected, Stripe timeout handled gracefully."

CONNECTION RULES:
- Connections represent data flow, not just dependencies.
- Every module must have at least one connection (either inbound or outbound) unless it is a standalone entry point.
- No cycles allowed. The graph must be a valid DAG.

OUTPUT FORMAT — respond with ONLY valid JSON:
{
  "reasoning": {
    "intent": "<what the user is building and why>",
    "constraints": ["<constraint 1>", "<constraint 2>"],
    "execution_flow": "<critical path description>",
    "failure_modes": ["<failure 1>", "<failure 2>", "<failure 3>"],
    "design_decisions": ["<decision 1 and why>", "<decision 2 and why>"]
  },
  "modules": [
    {
      "id": "M001",
      "name": "<label>",
      "coreTask": "<detailed 2-3 sentence description>",
      "dataShape": "<explicit input schema with types>",
      "expectedOutput": "<explicit output schema with types>",
      "rules": "<hard constraints>",
      "platform": "<technology stack>",
      "language": "<primary language>",
      "dependencies": "<packages with versions>",
      "errorHandling": "<specific exception scenarios>",
      "testingRequirements": "<specific test cases>"
    }
  ],
  "connections": [
    {"from_node": "M001", "to_node": "M002"}
  ]
}"""


def suggest_architecture(prompt: str, classification: dict = None, answers: dict = None) -> str:
    """Stage 3: Reasoning-based architecture generation.

    Uses the thinking model to reason about the architecture before
    generating the module list.  The reasoning chain is:
    Intent → Constraints → Flow → Failure Analysis → Architecture
    """
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        print("WARNING: No NVIDIA_API_KEY, returning mock architecture.")
        return _mock_architecture(prompt)

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
Generate the minimum modules needed. Respond with ONLY valid JSON."""

    try:
        print(f"[ARCH] Reasoning about architecture for: {prompt[:60]}...")

        # Use the thinking model for deep reasoning with JSON output
        raw = _call_thinking_model(REASONING_SYSTEM_PROMPT, user_prompt, json_mode=True)
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
1. Parse the architecture text and extract ALL module definitions.
2. Preserve all mandatory module fields EXACTLY as written.
3. Enforce deterministic module IDs (M001, M002, etc.). Do not generate arbitrary IDs or rename them.
4. Edge generation: Generate edges from the Mermaid diagram if present. If no diagram exists, infer edges from explicit dependency references in module descriptions and from the logical data flow between modules. Do NOT create edges that would form cycles.

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
        raw = _call_thinking_model(system_prompt, markdown_text, json_mode=True)
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

MODULE_REVIEW_PROMPT = """You are a ruthless architecture reviewer performing adversarial analysis on a software module.

Your job is NOT to be encouraging. Your job is to find REAL problems that will cause production incidents.

REVIEW CHECKLIST (evaluate each):
1. INTERFACE INTEGRITY: Are dataShape inputs fully consumed? Does expectedOutput cover all success AND error cases?
2. ERROR COVERAGE: Does errorHandling cover network failures, timeouts, invalid input, upstream failures, and resource exhaustion?
3. SPECIFICATION COMPLETENESS: Is coreTask specific enough that two different developers would implement it the same way?
4. DEPENDENCY RISK: Are dependencies pinned? Are there known vulnerabilities? Is there vendor lock-in?
5. TESTABILITY: Can the testing requirements actually verify the coreTask? Are edge cases covered?
6. SECURITY: Does this module handle auth tokens, PII, or secrets? If so, are they protected?

SCORING RUBRIC:
- 90-100: Production-ready. No critical issues.
- 70-89: Needs minor fixes. No blocking issues.
- 50-69: Significant gaps. Would cause incidents in production.
- 0-49: Fundamentally flawed. Needs redesign.

Respond with ONLY valid JSON:
{
  "score": 85,
  "verdict": "<production_ready|needs_fixes|significant_gaps|redesign_needed>",
  "issues": [
    {
      "severity": "<critical|major|minor>",
      "category": "<interface|error_handling|spec_completeness|dependency|testability|security>",
      "description": "<specific problem>",
      "fix": "<concrete fix recommendation>"
    }
  ],
  "suggestions": ["<improvement that would raise the score>"]
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
Find modules whose coreTask descriptions describe the SAME transformation on the SAME data.
Indicators of TRUE duplicates:
- Both modules mention the same input/output schemas
- Both modules handle the same entity (e.g., "User" or "Order")
- One module's coreTask is a strict subset of another's
FALSE duplicates (do NOT merge):
- Modules that process the same entity at different pipeline stages (e.g., "Validate Order" vs "Fulfill Order")
- Modules with similar names but different data flows
Keep the module with the better specification. Redirect all edges.

━━━ PASS 2: INFRASTRUCTURE EXTRACTION ━━━
INFRASTRUCTURE modules (convert to capabilities):
  Auth/AuthZ, Logging, Monitoring/Metrics, Rate Limiting, Caching, Generic Error Handling,
  Encryption/TLS, CORS, Generic Input Validation, Health Checks, Circuit Breaking
BUSINESS modules (NEVER convert, even if they sound infrastructure-like):
  Notification Service, Email/SMS Sender, Payment Processing, Search/Discovery,
  User Management, Dashboard, Reports, Analytics, File Storage, Webhooks

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


def auto_improve_architecture(graph_data: dict, instruction: str = None, original_reasoning: str = None) -> dict:
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
    reasoning_text = f"\nOriginal Architecture Reasoning:\n{original_reasoning}\n" if original_reasoning else ""

    prompt = f"""{reasoning_text}{instruction_text}
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



EXPAND_SYSTEM_PROMPT = """You are a Software Architect adding a NEW module to an existing system graph.

INPUTS YOU RECEIVE:
1. Existing modules with their IDs, names, and core tasks.
2. Existing connections (data flow edges).
3. The name and reason for the new module.

YOUR TASKS:
1. Assign a new ID that follows the existing convention. If existing IDs are M001, M002, M003, your new module should be the next sequential (e.g., M004). If existing IDs use other formats, match that format.
2. Design the module with COMPLETE, detailed specifications matching the quality of existing modules.
3. Determine connections by analyzing DATA FLOW:
   - connect_from: Which existing modules produce data that this new module CONSUMES?
   - connect_to: Which existing modules need data that this new module PRODUCES?
4. Match the technology stack and language conventions of the existing system unless the new module's requirements demand something different.

CONNECTION RULES:
- ONLY reference IDs that exist in the provided module list.
- Prefer connecting to adjacent modules in the pipeline, not distant ones.
- The new module must not create a cycle in the graph.
- If the module is a new entry point, connect_from can be empty.
- If the module is a terminal sink, connect_to can be empty.

Respond with ONLY valid JSON:
{
  "new_module": {
    "id": "<next sequential ID matching existing convention>",
    "name": "<descriptive name>",
    "coreTask": "<2-3 sentences with specific logic, not vague descriptions>",
    "dataShape": "<explicit input schema with types, e.g. { field: type }>",
    "expectedOutput": "<explicit output schema with types>",
    "rules": "<hard constraints and invariants>",
    "language": "<match existing system unless justified>",
    "dependencies": "<real packages with version ranges>",
    "errorHandling": "<2-3 specific exception scenarios with recovery>",
    "testingRequirements": "<3-5 specific, falsifiable test cases>"
  },
  "connect_from": ["<existing_id that feeds INTO this module>"],
  "connect_to": ["<existing_id that this module feeds INTO>"]
}"""


def expand_architecture(graph_data: dict, module_name: str, reason: str, original_reasoning: str = None) -> dict:
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

    reasoning_text = f"\nOriginal Architecture Reasoning:\n{original_reasoning}\n" if original_reasoning else ""

    prompt = f"""{reasoning_text}EXISTING MODULES (use ONLY these IDs):
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


async def async_expand_architecture(graph_data: dict, module_name: str, reason: str, original_reasoning: str = None) -> dict:
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

    reasoning_text = f"\nOriginal Architecture Reasoning:\n{original_reasoning}\n" if original_reasoning else ""

    prompt = f"""{reasoning_text}EXISTING MODULES (use ONLY these IDs):
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


async def batch_expand_architecture(graph_data: dict, modules_to_add: list, original_reasoning: str = None) -> dict:
    """Generates multiple modules concurrently using async expansion."""
    import asyncio
    all_new_modules = []
    all_new_connections = []
    
    tasks = []
    for item in modules_to_add:
        tasks.append(async_expand_architecture(graph_data, item["name"], item.get("reason", "Required"), original_reasoning))
        
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Process the async results, building up the graph incrementally
    current_graph = {
        "nodes": list(graph_data.get("nodes", [])),
        "edges": list(graph_data.get("edges", [])),
    }

    for i, result in enumerate(results):
        item_name = modules_to_add[i].get("name", "unknown")
        
        if isinstance(result, Exception):
            print(f"WARNING: Failed to expand '{item_name}': {result}")
            continue

        try:
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
            print(f"WARNING: Failed to process result for '{item_name}': {e}")
            continue

    return {"new_modules": all_new_modules, "new_connections": all_new_connections}


# ═══════════════════════════════════════════════════════════════
#  CODE GENERATION & FLOWCHART  (per-module tools)
# ═══════════════════════════════════════════════════════════════

CODE_GENERATION_SYSTEM_PROMPT = """You are an expert Python developer writing a module for the EasePr framework.
Write ONLY raw Python source code. No markdown fences. No explanations before or after the code.

RULES:
1. File must contain exactly one entry point: def run(state: dict) -> dict
2. Use Python 3.10+ features (match/case, type unions with |, etc.) where appropriate.
3. Extract inputs with state.get() and sensible defaults. Validate required inputs — raise ValueError with clear messages.
4. Implement ACTUAL business logic, not stubs or placeholders.
5. Return a dict with EXACTLY the keys described in "Expected Output".
6. Wrap ALL external calls (HTTP, DB, file I/O) in try/except with specific exception types.
7. Add brief inline comments for non-obvious logic.
8. Use type hints on all helper functions and class methods.
9. Import all dependencies at the top of the file.
10. NO placeholders, NO 'TODO', NO 'pass', NO '...' as implementation.
11. Follow the error handling patterns from the module spec — each documented error scenario must have a corresponding except clause.
12. If the module processes collections, handle empty collections gracefully."""


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
ONLY raw Mermaid code. No markdown fences. Start with: graph TD

REQUIREMENTS:
- Include an input validation step with a decision diamond.
- Show the happy path (main processing flow) with 3-5 processing nodes.
- Include a separate error path for EACH error scenario from the errorHandling spec.
- End with a final output node.
- Use descriptive labels: Process[Parse Input Data] not Process[Process].
- Target 8-15 nodes total. Never fewer than 6.
- Use proper Mermaid syntax: decision diamonds {{}}, rounded ([]) for start/end, square [] for process."""


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
    safe_name = name.lower().replace(" ", "_")
    return f'''def run(state: dict) -> dict:
    """{name}: {spec.get("coreTask", "Process data.")}"""
    if not state:
        raise ValueError("State cannot be empty")
    result = dict(state)
    result["_{safe_name}_done"] = True
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

RULES:
1. Return ONLY valid JSON representing the fully updated module. Do NOT wrap it in markdown.
2. Keep ALL existing fields. Do not remove fields unless the user explicitly requests removal.
3. When modifying dataShape or expectedOutput, ensure the changes are compatible with upstream and downstream modules.
4. When changing errorHandling, ensure the new error scenarios match the updated coreTask.
5. When changing dependencies, use real package names with version ranges.
6. Preserve the module ID — never change it."""
    
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

YOUR OUTPUT FORMAT:
1. First, explain in exactly 2 concise sentences: what you will change and WHY it improves the module.
2. Then, output EXACTLY ONE JSON block wrapped in ```json ... ``` with the fully updated module.

RULES:
- Keep ALL existing JSON fields. Do not remove fields unless explicitly asked.
- When modifying dataShape or expectedOutput, ensure compatibility with the module's stated dependencies.
- When changing errorHandling, ensure new scenarios match the updated coreTask.
- Preserve the module ID — never change it.
- Your final output must end with the JSON block."""
    
    user_prompt = f"CURRENT MODULE STATE:\n{json.dumps(module_data, indent=2)}\n\nUSER REQUEST:\n{user_message}"
    
    try:
        print(f"[CHAT-STREAM] Reasoning about module update...")
        for chunk in _call_thinking_model_stream(system_prompt, user_prompt):
            yield chunk
    except Exception as e:
        print(f"ERROR: Module chat streaming failed: {e}")
        traceback.print_exc()
        yield f"\n\n**Error:** {str(e)}"
