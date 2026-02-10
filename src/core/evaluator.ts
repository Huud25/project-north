import { applyPolicy } from "./policy";
import { EvaluationResult } from "./types";

export function evaluateChange(
  input: string,
  env: string
): EvaluationResult {
  const result = applyPolicy(input, env);

  const next_steps =
    result.decision === "AUTO"
      ? ["execute_change", "monitor"]
      : result.decision === "APPROVAL"
      ? ["request_human_approval", "verify_backups", "schedule_window"]
      : ["block_action", "escalate_to_oncall"];

  return {
    risk_level: result.risk,
    decision: result.decision,
    confidence: result.confidence,
    reasons: result.reasons,
    next_steps
  };
}
