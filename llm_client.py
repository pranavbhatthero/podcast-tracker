"""
LLM client factory — supports Anthropic, OpenAI, and any OpenAI-compatible endpoint.

Priority (highest to lowest):
  1. LLM_PROVIDER=openai  → uses OPENAI_API_KEY (or OPENAI_BASE_URL for custom endpoint)
  2. ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BEDROCK_BASE_URL  → Salesforce/Bedrock gateway
  3. ANTHROPIC_AUTH_TOKEN alone  → Anthropic with explicit key
  4. ANTHROPIC_API_KEY  → standard Anthropic (default)

All callers use the returned client via client.messages.create(...) using the
Anthropic message format. When OpenAI is selected the client is a thin wrapper
that translates to the OpenAI chat-completions API transparently.

Set LLM_MODEL to override the default model for whichever provider is active.
"""

import os
from typing import Any


# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_OPENAI_MODEL    = "gpt-4o-mini"


def _default_model() -> str:
    env = os.environ.get("LLM_MODEL", "").strip()
    if env:
        return env
    provider = os.environ.get("LLM_PROVIDER", "").strip().lower()
    return DEFAULT_OPENAI_MODEL if provider == "openai" else DEFAULT_ANTHROPIC_MODEL


# ── OpenAI wrapper (Anthropic-compatible interface) ────────────────────────────

class _OpenAIWrapper:
    """Wraps openai.OpenAI so callers can use the same .messages.create() interface."""

    def __init__(self, openai_client, model: str):
        self._client = openai_client
        self._model  = model
        self.messages = self  # so client.messages.create() works

    def create(self, *, model: str = "", max_tokens: int = 4096,
               system=None, messages: list = None, **kwargs) -> Any:
        model = model or self._model

        # Convert Anthropic system format → OpenAI
        sys_text = ""
        if isinstance(system, str):
            sys_text = system
        elif isinstance(system, list):
            sys_text = "\n".join(
                b["text"] if isinstance(b, dict) else str(b) for b in system
            )

        oai_msgs = []
        if sys_text:
            oai_msgs.append({"role": "system", "content": sys_text})
        for m in (messages or []):
            oai_msgs.append({"role": m["role"], "content": m["content"]})

        resp = self._client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=oai_msgs,
        )

        # Return an object that mimics anthropic.types.Message
        class _FakeContent:
            def __init__(self, text):
                self.text = text

        class _FakeResp:
            def __init__(self, text):
                self.content = [_FakeContent(text)]

        return _FakeResp(resp.choices[0].message.content or "")


# ── Public factory ─────────────────────────────────────────────────────────────

def make_client():
    """Return (client, model_name) ready for use."""
    provider = os.environ.get("LLM_PROVIDER", "").strip().lower()
    model    = _default_model()

    if provider == "openai":
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError(
                "openai package not installed. Run: pip install openai"
            )
        base_url = os.environ.get("OPENAI_BASE_URL", "").strip() or None
        api_key  = os.environ.get("OPENAI_API_KEY", "")
        raw = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)
        return _OpenAIWrapper(raw, model), model

    # Anthropic (default)
    try:
        import anthropic
    except ImportError:
        raise ImportError(
            "anthropic package not installed. Run: pip install anthropic"
        )

    token    = os.environ.get("ANTHROPIC_AUTH_TOKEN", "").strip()
    bedrock  = os.environ.get("ANTHROPIC_BEDROCK_BASE_URL", "").strip()
    ca_bundle = os.environ.get("NODE_EXTRA_CA_CERTS", "").strip()

    if bedrock:
        base_url = bedrock[:-len("/bedrock")] if bedrock.endswith("/bedrock") else bedrock.rstrip("/")
    else:
        base_url = None

    if token and base_url:
        import httpx
        http = httpx.Client(verify=ca_bundle if ca_bundle else True)
        client = anthropic.Anthropic(api_key=token, base_url=base_url, http_client=http)
    elif token:
        client = anthropic.Anthropic(api_key=token)
    else:
        client = anthropic.Anthropic()  # uses ANTHROPIC_API_KEY from env

    return client, model
