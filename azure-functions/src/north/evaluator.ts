import { evaluatePolicy } from "./policy.js";

type Env = "dev" | "staging" | "prod";

export function evaluateChange(input: unknown, env: Env, actionType: string) {
  const policy = evaluatePolicy({
    env,
    actionType,

    // defaults seguros (você pode evoluir depois para vir do input)
    reversible: true,
    blastRadius: "service",
    governanceMissing: [],
  });

  const next_steps =
    policy.decision === "AUTO"
      ? ["execute_change", "monitor"]
      : policy.decision === "APPROVAL"
      ? ["request_human_approval", "verify_backup", "confirm_change_ticket"]
      : ["block_execution", "escalate_to_oncall"];

  return {
    // ✅ contrato atual preservado
    risk_level: policy.riskLevel,
    decision: policy.decision,
    risk_score: policy.riskScore,
    confidence: policy.confidence,
    reasons: policy.reasons,
    next_steps,
    signals: policy.signals,

    // ✅ extras enterprise (não quebra quem ignora)
    policy_version: policy.policyVersion,
    risk_model: policy.riskModel,
    factor_breakdown: policy.factorBreakdown,
    synergy_adjustments: policy.synergyAdjustments,
    guardrail_hits: policy.guardrailHits,
  };
}
