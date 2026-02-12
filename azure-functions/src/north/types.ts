export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Decision = "AUTO" | "APPROVAL" | "BLOCK";

export type RiskSignals = {
  environment: string;
  actionType: string;
  reversible: boolean;
  blastRadius: string;
  governanceMissing: string[];
};

export type PolicyEvaluation = {
  riskLevel: RiskLevel;
  decision: Decision;

  // 0..100 (quanto maior, mais arriscado)
  riskScore: number;

  // 0..1 (confiança do motor)
  confidence: number;

  reasons: string[];
  signals: RiskSignals;
};
