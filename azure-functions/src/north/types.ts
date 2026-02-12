export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Decision = "AUTO" | "APPROVAL" | "BLOCK";

export type RiskSignals = {
  environment: string;
  actionType: string;
  reversible: boolean;
  blastRadius: string;
  governanceMissing: string[];

  // ✅ (opcionais, enterprise-ready — não quebra nada se não vier)
  assetCriticality?: "TIER_0" | "TIER_1" | "TIER_2";
  changeWindow?: "BUSINESS_HOURS" | "OFF_HOURS" | "FREEZE";
  privilegeLevel?: "LOW" | "MEDIUM" | "HIGH";
};

export type RiskFactorBreakdown = {
  factor:
    | "environment"
    | "actionType"
    | "blastRadius"
    | "reversible"
    | "governanceMissing"
    | "assetCriticality"
    | "changeWindow"
    | "privilegeLevel";
  input: unknown;
  severity: number; // 0..1
  weight: number; // pontos
  contribution: number; // pontos
  rationale: string;
};

export type GuardrailHit = {
  id: string;
  effect: "REQUIRE_APPROVAL" | "BLOCK";
  rationale: string;
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

  // ✅ novos campos (opcionais) — backward compatible
  policyVersion?: string;
  riskModel?: string;
  factorBreakdown?: RiskFactorBreakdown[];
  guardrailHits?: GuardrailHit[];
  synergyAdjustments?: { id: string; delta: number; rationale: string }[];
};
