import os
import json
import hashlib
from typing import Optional

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")

def _is_cache_enabled() -> bool:
    return os.environ.get("USE_CACHE", "true").lower() == "true"

def _get_cache_path(system_prompt: str, user_prompt: str, kwargs: dict) -> str:
    # Create a deterministic string from the inputs
    key_string = f"{system_prompt}|{user_prompt}|{json.dumps(kwargs, sort_keys=True)}"
    key_hash = hashlib.md5(key_string.encode('utf-8')).hexdigest()
    return os.path.join(CACHE_DIR, f"{key_hash}.json")

def get_cached_response(system_prompt: str, user_prompt: str, **kwargs) -> Optional[str]:
    """Retrieve a cached LLM response if it exists and caching is enabled."""
    if not _is_cache_enabled():
        return None

    path = _get_cache_path(system_prompt, user_prompt, kwargs)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("response")
        except Exception as e:
            print(f"Cache read error: {e}")
    return None

def set_cached_response(system_prompt: str, user_prompt: str, response: str, **kwargs):
    """Save an LLM response to the cache."""
    if not _is_cache_enabled():
        return

    path = _get_cache_path(system_prompt, user_prompt, kwargs)
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
                "kwargs": kwargs,
                "response": response
            }, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Cache write error: {e}")
