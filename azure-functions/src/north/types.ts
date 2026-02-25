export type Environment = "dev" | "staging" | "prod";
export type ActionType = "restart" | "deploy" | "delete" | "drop";

export type NorthPolicyDecision = "AUTO" | "APPROVAL" | "BLOCK";
export type NorthRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type NorthPolicyInput = {
  env: Environment;
  actionType: ActionType;
  reversible: boolean;
  blastRadius: number; // 0..10 (recomendado), mas aceitamos qualquer number e clampamos no motor
  governanceMissing: boolean;

  // Permite evolução sem quebrar input (fields extras ignorados pela policy)
  [k: string]: unknown;
};

export type NorthPolicyResult = {
  policyVersion: string;

  riskScore: number; // 0..100
  riskLevel: NorthRiskLevel;
  decision: NorthPolicyDecision;

  confidence: number; // 0..1
  reasons: string[];

  signals: Array<{
    key: string;
    value: unknown;
    severity?: "info" | "warning" | "critical";
  }>;

  riskBreakdown: {
    environment: number;
    action: number;
    blastRadius: number;
    irreversible: number;
    governanceMissing: number;
    total: number;
  };
};

export type EvaluateNorthResponse = {
  ok: true;
  requestId: string;
  timestamp: string;
  input: NorthPolicyInput;
  policy: NorthPolicyResult;
};