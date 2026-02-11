export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Decision = "AUTO" | "APPROVAL" | "BLOCK";

export type RiskSignals = {
  environment: string;
  actionType: string;
  reversible: boolean;
  blastRadius: string;
  governanceMissing: string[];
};

export interface EvaluationResult {
  risk_level: RiskLevel;
  decision: Decision;
  confidence: number;
  reasons: string[];
  next_steps: string[];
  signals: RiskSignals;
}
