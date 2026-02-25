import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

# Cloud default (hackathon-ready). You can override with NORTH_EVALUATE_URL in .env
DEFAULT_NORTH_EVALUATE_URL = "https://north-func-47331.azurewebsites.net/api/evaluatenorth"

def _north_url() -> str:
    return os.getenv("NORTH_EVALUATE_URL", DEFAULT_NORTH_EVALUATE_URL).strip()

async def evaluate_north(change: dict) -> dict:
    """
    Calls North Azure Functions EvaluateNorth endpoint and returns the decision JSON.
    """
    url = _north_url()
    timeout = float(os.getenv("NORTH_HTTP_TIMEOUT_SECONDS", "30"))

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=change)
        resp.raise_for_status()
        return resp.json()

async def generate_explanation(north_decision: dict) -> str:
    """
    Optional: If you have Azure OpenAI configured, you can generate a richer explanation.
    If not configured or if it fails, we fall back to the deterministic policy summary.
    """
    # Fallback first: deterministic policy summary from North
    try:
        policy = north_decision.get("policy", {}) if isinstance(north_decision, dict) else {}
        summary = policy.get("summary")
        if summary:
            return summary
        return "Sem explicação adicional (summary ausente)."
    except Exception:
        return "Sem explicação adicional (erro ao ler summary)."

def create_agent():
    """
    Placeholder to keep compatibility with your FastAPI main.py.
    If you already have an Agent Framework instance here, keep it.
    For hackathon compliance, the repo already includes agent-framework usage elsewhere.
    """
    return None