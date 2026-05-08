from dataclasses import dataclass
from typing import Any, Dict, Optional

from .model_aliases import normalize_model


@dataclass
class TokenUsage:
    provider: str
    raw_model: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cached_tokens: int = 0


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def parse_usage(provider: str, request_json: Optional[Dict[str, Any]], response_json: Any) -> Optional[TokenUsage]:
    if not isinstance(response_json, dict):
        return None

    raw_model = str(response_json.get("model") or (request_json or {}).get("model") or "")
    usage = response_json.get("usage")

    if isinstance(usage, dict):
        prompt = _int(usage.get("prompt_tokens") or usage.get("input_tokens"))
        completion = _int(usage.get("completion_tokens") or usage.get("output_tokens"))
        total = _int(usage.get("total_tokens")) or prompt + completion
        cached = 0
        prompt_details = usage.get("prompt_tokens_details") or usage.get("input_token_details")
        if isinstance(prompt_details, dict):
            cached = _int(prompt_details.get("cached_tokens") or prompt_details.get("cache_read_input_tokens"))
        return TokenUsage(
            provider=provider,
            raw_model=raw_model or "unknown",
            model=normalize_model(raw_model),
            prompt_tokens=prompt,
            completion_tokens=completion,
            total_tokens=total,
            cached_tokens=cached,
        )

    metadata = response_json.get("usageMetadata")
    if isinstance(metadata, dict):
        prompt = _int(metadata.get("promptTokenCount"))
        completion = _int(metadata.get("candidatesTokenCount"))
        total = _int(metadata.get("totalTokenCount")) or prompt + completion
        cached = _int(metadata.get("cachedContentTokenCount"))
        if not raw_model:
            raw_model = _model_from_gemini_request(request_json)
        return TokenUsage(
            provider=provider,
            raw_model=raw_model or "unknown",
            model=normalize_model(raw_model),
            prompt_tokens=prompt,
            completion_tokens=completion,
            total_tokens=total,
            cached_tokens=cached,
        )

    return None


def _model_from_gemini_request(request_json: Optional[Dict[str, Any]]) -> str:
    if not isinstance(request_json, dict):
        return ""
    return str(request_json.get("model") or "")
