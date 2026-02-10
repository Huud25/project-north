import { applyPolicy } from "./policy.js";

export function evaluateChange(input: any, env: any, actionType: any): any {
  const policy = applyPolicy(input, env, actionType);
  const next_steps =
    policy.decision === "AUTO"
      ? ["execute_change", "monitor"]
      : policy.decision === "APPROVAL"
      ? ["request_human_approval", "verify_backup", "confirm_change_ticket"]
      : ["block_execution", "escalate_to_oncall"];

  return {
    risk_level: policy.riskLevel,
    decision: policy.decision,
    confidence: policy.confidence,
    reasons: policy.reasons,
    next_steps,
    signals: policy.signals
  };
}
