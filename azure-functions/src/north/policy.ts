import { POLICY_CONFIG } from "./policy.config.js";

type NorthPolicyInput = {
  env?: string;
  actionType?: string;
  reversible?: boolean;
  blastRadius?: number;
  governanceMissing?: boolean;
  [k: string]: unknown;
};

type NorthPolicyDecision = "AUTO" | "APPROVAL" | "BLOCK";
type NorthRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type NorthPolicyResult = {
  policyVersion: string;
  riskScore: number;
  riskLevel: NorthRiskLevel;
  decision: NorthPolicyDecision;
  confidence: number;
  summary: string;
  reasons: string[];
  signals: Array<{ key: string; value: unknown; severity?: "info" | "warning" | "critical" }>;
  riskBreakdown: {
    environment: number;
    action: number;
    blastRadius: number;
    irreversible: number;
    governanceMissing: number;
    total: number;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getEnvScore(env?: string): number {
  const e = (env ?? "").toLowerCase();
  return POLICY_CONFIG.environmentScores[e as keyof typeof POLICY_CONFIG.environmentScores] ?? 0;
}

function getActionScore(actionType?: string): number {
  const a = (actionType ?? "").toLowerCase();
  return POLICY_CONFIG.actionScores[a as keyof typeof POLICY_CONFIG.actionScores] ?? 0;
}

function getBlastRadiusScore(blastRadius?: number): number {
  const br = typeof blastRadius === "number" ? blastRadius : 0;
  return clamp(br * POLICY_CONFIG.blastRadius.multiplier, 0, POLICY_CONFIG.blastRadius.maxScore);
}

function getIrreversibleScore(reversible?: boolean): number {
  return reversible ? 0 : POLICY_CONFIG.penalties.irreversible;
}

function getGovernanceMissingScore(governanceMissing?: boolean): number {
  return governanceMissing ? POLICY_CONFIG.penalties.governanceMissing : 0;
}

function getRiskLevel(score: number): NorthRiskLevel {
  if (score >= POLICY_CONFIG.thresholds.CRITICAL) return "CRITICAL";
  if (score >= POLICY_CONFIG.thresholds.HIGH) return "HIGH";
  if (score >= POLICY_CONFIG.thresholds.MEDIUM) return "MEDIUM";
  return "LOW";
}

function getDecision(
  input: NorthPolicyInput,
  riskLevel: NorthRiskLevel
): NorthPolicyDecision {

  const env = (input.env ?? "").toLowerCase();

  // 🔒 STRICT MODE FOR PRODUCTION
  if (POLICY_CONFIG.strictProduction && env === "prod") {
    if (riskLevel === "CRITICAL") return "BLOCK";
    if (riskLevel === "HIGH") return "APPROVAL";
    if (input.reversible === false) return "APPROVAL";
    if (input.governanceMissing) return "BLOCK";
  }

  // Default logic
  if (riskLevel === "CRITICAL") return "BLOCK";
  if (riskLevel === "HIGH") return "APPROVAL";
  if (riskLevel === "MEDIUM") return "APPROVAL";
  return "AUTO";
}

function getConfidence(score: number, riskLevel: NorthRiskLevel): number {
  const extremity = Math.abs(score - 50) / 50;
  const base =
    riskLevel === "CRITICAL" || riskLevel === "LOW"
      ? 0.85 + 0.1 * extremity
      : 0.75 + 0.1 * extremity;

  return clamp(round2(base), 0.5, 0.99);
}

function buildExecutiveSummary(
  input: NorthPolicyInput,
  riskScore: number,
  riskLevel: NorthRiskLevel,
  decision: NorthPolicyDecision
): string {
  const env = (input.env ?? "unknown").toLowerCase();
  const action = (input.actionType ?? "unknown").toLowerCase();

  return `
This change has been classified as ${riskLevel} risk (score ${riskScore}/100).
The operation targets the ${env} environment and includes action "${action}".
Decision: ${decision} under current governance thresholds.
  `.trim().replace(/\s+/g, " ");
}

export function evaluatePolicy(input: NorthPolicyInput): NorthPolicyResult {
  const envScore = getEnvScore(input.env);
  const actionScore = getActionScore(input.actionType);
  const blastRadiusScore = getBlastRadiusScore(input.blastRadius);
  const irreversibleScore = getIrreversibleScore(input.reversible);
  const governanceScore = getGovernanceMissingScore(input.governanceMissing);

  const weighted =
    envScore * POLICY_CONFIG.weights.environment +
    actionScore * POLICY_CONFIG.weights.action +
    blastRadiusScore * POLICY_CONFIG.weights.blastRadius +
    irreversibleScore * POLICY_CONFIG.weights.irreversible +
    governanceScore * POLICY_CONFIG.weights.governanceMissing;

  const riskScore = clamp(Math.round(weighted), 0, 100);
  const riskLevel = getRiskLevel(riskScore);
  const decision = getDecision(input, riskLevel);

  const riskBreakdown = {
    environment: envScore,
    action: actionScore,
    blastRadius: blastRadiusScore,
    irreversible: irreversibleScore,
    governanceMissing: governanceScore,
    total: riskScore
  };

  const confidence = getConfidence(riskScore, riskLevel);

  const summary = buildExecutiveSummary(input, riskScore, riskLevel, decision);

  return {
    policyVersion: POLICY_CONFIG.policyVersion,
    riskScore,
    riskLevel,
    decision,
    confidence,
    summary,
    reasons: [],
    signals: [],
    riskBreakdown
  };
}

export const applyPolicy = evaluatePolicy;