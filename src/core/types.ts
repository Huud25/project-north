export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Decision = "AUTO" | "APPROVAL" | "BLOCK";

export interface EvaluationResult {
  risk_level: RiskLevel;
  decision: Decision;
  confidence: number;
  reasons: string[];
  next_steps: string[];
}
