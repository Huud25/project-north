import json
import os
from typing import Any, Dict

import httpx
from dotenv import load_dotenv

from agent_framework import tool
from agent_framework.azure import AzureOpenAIChatClient

load_dotenv()


def _north_evaluate_url() -> str:
    return os.getenv("NORTH_EVALUATE_URL", "http://localhost:7071/api/EvaluateNorth").rstrip("/")


@tool(
    name="evaluate_north",
    description="Avalia mudança operacional no North e retorna decisão determinística.",
    approval_mode="never_require",
)
async def evaluate_north(change: Dict[str, Any], **kwargs: Any) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(_north_evaluate_url(), json=change)
        resp.raise_for_status()
        return resp.json()


def _instructions() -> str:
    return (
        "Você é o NorthGovernanceAgent.\n"
        "O JSON do North é a fonte da verdade.\n"
        "Explique em PT-BR: decision, riskScore, riskLevel, confidence, riskBreakdown e summary.\n"
        "Se decision=BLOCK, sugira mitigação prática.\n"
        "Não invente dados.\n"
    )


def create_agent():
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    deployment = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT_NAME")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")

    if not api_key or not endpoint or not deployment:
        missing = [k for k, v in {
            "AZURE_OPENAI_API_KEY": api_key,
            "AZURE_OPENAI_ENDPOINT": endpoint,
            "AZURE_OPENAI_CHAT_DEPLOYMENT_NAME": deployment,
        }.items() if not v]
        raise ValueError(f"Faltando variáveis no .env: {', '.join(missing)}")

    client = AzureOpenAIChatClient(
        api_key=api_key,
        endpoint=endpoint,
        deployment_name=deployment,
        api_version=api_version,
    )

    return client.as_agent(
        name="NorthGovernanceAgent",
        instructions=_instructions(),
        tools=[evaluate_north],
    )


async def generate_explanation(agent: Any, north_decision: Dict[str, Any], change: Dict[str, Any]) -> str:
    prompt = (
        "Use o JSON do North como fonte da verdade.\n\n"
        "North decision JSON:\n"
        f"{json.dumps(north_decision, indent=2, ensure_ascii=False)}\n\n"
        "Change request:\n"
        f"{json.dumps(change, indent=2, ensure_ascii=False)}\n"
    )

    result = await agent.run(prompt)
    return getattr(result, "text", str(result))