from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.agent import create_agent, evaluate_north, generate_explanation

app = FastAPI(title="North Agent", version="1.0.0")

agent = None


class RunRequest(BaseModel):
    change: Dict[str, Any]


@app.on_event("startup")
async def startup_event():
    global agent
    agent = create_agent()


@app.get("/health")
async def health():
    return {"status": "ok"}


def _fallback_explanation(north_decision: Dict[str, Any]) -> str:
    policy = (north_decision or {}).get("policy", {}) or {}
    decision = policy.get("decision")
    risk_score = policy.get("riskScore")
    risk_level = policy.get("riskLevel")
    confidence = policy.get("confidence")
    breakdown = policy.get("riskBreakdown")
    summary = policy.get("summary")

    mitigation = ""
    if decision == "BLOCK":
        mitigation = (
            "\n\nMitigação sugerida:\n"
            "- Reduzir blast radius (limitar escopo/targets)\n"
            "- Evitar ação irreversível (ou adicionar plano de rollback)\n"
            "- Exigir aprovação (APPROVAL) e anexar evidências\n"
            "- Completar governança/compliance (change ticket, CAB, etc.)\n"
        )

    return (
        f"Decisão: {decision}\n"
        f"Risk score: {risk_score}\n"
        f"Risk level: {risk_level}\n"
        f"Confidence: {confidence}\n"
        f"Risk breakdown: {breakdown}\n"
        f"Summary: {summary}"
        f"{mitigation}"
    )


@app.post("/run")
async def run(req: RunRequest):
    global agent

    # 1) Sempre garante a decisão determinística via tool call
    try:
        north_decision = await evaluate_north(req.change)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro chamando EvaluateNorth: {str(e)}")

    # 2) Tenta gerar explicação via LLM, mas não quebra nunca
    llm_error = None
    explanation = None

    if agent is not None:
        try:
            explanation = await generate_explanation(agent, north_decision, req.change)
        except Exception as e:
            llm_error = str(e)

    # 3) Fallback: sempre retorna algo apresentável para demo
    if not explanation or not str(explanation).strip():
        explanation = _fallback_explanation(north_decision)

    return {
        "agentResponse": explanation,
        "northDecision": north_decision,
        "llmError": llm_error,
    }