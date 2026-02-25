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

function getEnvScore(env: string | undefined): number {
  const e = (env ?? "").toLowerCase();
  const map = POLICY_CONFIG.environmentScores as Record<string, number>;
  return map[e] ?? 0;
}

function getActionScore(actionType: string | undefined): number {
  const a = (actionType ?? "").toLowerCase();
  const map = POLICY_CONFIG.actionScores as Record<string, number>;
  return map[a] ?? 0;
}

function getBlastRadiusScore(blastRadius: number | undefined): number {
  const br = typeof blastRadius === "number" ? blastRadius : 0;
  const raw = br * POLICY_CONFIG.blastRadius.multiplier;
  return clamp(raw, 0, POLICY_CONFIG.blastRadius.maxScore);
}

function getIrreversibleScore(reversible: boolean | undefined): number {
  return reversible ? 0 : POLICY_CONFIG.penalties.irreversible;
}

function getGovernanceMissingScore(governanceMissing: boolean | undefined): number {
  return governanceMissing ? POLICY_CONFIG.penalties.governanceMissing : 0;
}

function getRiskLevel(score: number): NorthRiskLevel {
  if (score >= POLICY_CONFIG.thresholds.CRITICAL) return "CRITICAL";
  if (score >= POLICY_CONFIG.thresholds.HIGH) return "HIGH";
  if (score >= POLICY_CONFIG.thresholds.MEDIUM) return "MEDIUM";
  return "LOW";
}

function getDecision(
  riskLevel: NorthRiskLevel,
  governanceMissing: boolean | undefined,
  env: string | undefined
): NorthPolicyDecision {
  const e = (env ?? "").toLowerCase();

  if (e === "prod" && governanceMissing) {
    if (riskLevel === "LOW") return "APPROVAL";
    return "BLOCK";
  }

  if (riskLevel === "CRITICAL") return "BLOCK";
  if (riskLevel === "HIGH") return "APPROVAL";
  if (riskLevel === "MEDIUM") return "APPROVAL";
  return "AUTO";
}

function getConfidence(score: number, riskLevel: NorthRiskLevel, governanceMissing: boolean | undefined): number {
  const extremity = Math.abs(score - 50) / 50;
  const base =
    riskLevel === "CRITICAL" || riskLevel === "LOW"
      ? 0.85 + 0.1 * extremity
      : 0.75 + 0.1 * extremity;

  const penalty = governanceMissing ? 0.12 : 0;
  return clamp(round2(base - penalty), 0.5, 0.99);
}

function classifyBlastRadius(blastRadius: number | undefined): "low" | "moderate" | "high" {
  const br = typeof blastRadius === "number" ? blastRadius : 0;
  if (br >= 7) return "high";
  if (br >= 4) return "moderate";
  return "low";
}

function isDestructiveAction(actionType: string | undefined): boolean {
  const a = (actionType ?? "").toLowerCase();
  return a === "delete" || a === "drop";
}

function buildExecutiveSummary(input: NorthPolicyInput, result: { riskScore: number; riskLevel: NorthRiskLevel; decision: NorthPolicyDecision }): string {
  const env = (input.env ?? "unknown").toLowerCase();
  const action = (input.actionType ?? "unknown").toLowerCase();
  const brClass = classifyBlastRadius(input.blastRadius);
  const destructive = isDestructiveAction(input.actionType);

  const parts: string[] = [];

  parts.push(`This change has been classified as ${result.riskLevel} risk (score ${result.riskScore}/100).`);

  // Linha 2: contexto de ambiente + ação
  if (env === "prod") {
    parts.push("The operation targets a production environment, increasing operational exposure.");
  } else if (env === "staging") {
    parts.push("The operation targets a staging environment with moderate operational exposure.");
  } else if (env === "dev") {
    parts.push("The operation targets a development environment with reduced operational exposure.");
  } else {
    parts.push("The target environment could not be validated and may increase uncertainty.");
  }

  // Linha 3: ação + blast radius + reversibilidade + governança
  const line3: string[] = [];

  if (destructive) {
    line3.push(`It includes a destructive action (“${action}”)`);
  } else {
    line3.push(`It includes an operational action (“${action}”)`);
  }

  if (brClass === "high") line3.push("with elevated blast radius");
  if (brClass === "moderate") line3.push("with moderate blast radius");
  if (brClass === "low") line3.push("with limited blast radius");

  if (input.reversible === false) line3.push("and is marked as irreversible");
  if (input.governanceMissing) line3.push("with missing governance controls");

  // Finaliza linha 3 com ponto
  parts.push(`${line3.join(" ")}.`);

  // Linha 4: decisão
  if (result.decision === "AUTO") {
    parts.push("Decision: eligible for automatic execution under current governance thresholds.");
  } else if (result.decision === "APPROVAL") {
    parts.push("Decision: requires approval before execution under current governance thresholds.");
  } else {
    parts.push("Decision: blocked under current governance thresholds.");
  }

  return parts.join(" ");
}

function buildReasons(input: NorthPolicyInput, riskLevel: NorthRiskLevel, breakdown: NorthPolicyResult["riskBreakdown"]): string[] {
  const reasons: string[] = [];

  const env = (input.env ?? "").toLowerCase();
  const action = (input.actionType ?? "").toLowerCase();

  if (env === "prod") reasons.push("Ambiente de produção aumenta o risco.");
  if (action === "drop" || action === "delete") reasons.push("Ação destrutiva aumenta o risco.");
  if (input.reversible === false) reasons.push("Mudança irreversível aumenta o risco.");
  if ((input.blastRadius ?? 0) >= 6) reasons.push("Blast radius alto indica grande impacto potencial.");
  if (input.governanceMissing) reasons.push("Controles de governança ausentes aumentam o risco e reduzem confiança.");

  reasons.push(`Score final: ${breakdown.total}/100 (${riskLevel}).`);

  return reasons;
}

function buildSignals(input: NorthPolicyInput, decision: NorthPolicyDecision, riskLevel: NorthRiskLevel): NorthPolicyResult["signals"] {
  const env = (input.env ?? "").toLowerCase();
  const action = (input.actionType ?? "").toLowerCase();

  return [
    { key: "env", value: env, severity: env === "prod" ? "warning" : "info" },
    { key: "actionType", value: action, severity: action === "drop" || action === "delete" ? "warning" : "info" },
    { key: "reversible", value: !!input.reversible, severity: input.reversible ? "info" : "warning" },
    { key: "blastRadius", value: input.blastRadius ?? 0, severity: (input.blastRadius ?? 0) >= 6 ? "warning" : "info" },
    { key: "governanceMissing", value: !!input.governanceMissing, severity: input.governanceMissing ? "critical" : "info" },
    { key: "riskLevel", value: riskLevel, severity: riskLevel === "CRITICAL" ? "critical" : riskLevel === "HIGH" ? "warning" : "info" },
    { key: "decision", value: decision, severity: decision === "BLOCK" ? "critical" : decision === "APPROVAL" ? "warning" : "info" }
  ];
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
  const decision = getDecision(riskLevel, input.governanceMissing, input.env);

  const riskBreakdown = {
    environment: envScore,
    action: actionScore,
    blastRadius: blastRadiusScore,
    irreversible: irreversibleScore,
    governanceMissing: governanceScore,
    total: riskScore
  };

  const confidence = getConfidence(riskScore, riskLevel, input.governanceMissing);
  const reasons = buildReasons(input, riskLevel, riskBreakdown);
  const signals = buildSignals(input, decision, riskLevel);

  const summary = buildExecutiveSummary(input, { riskScore, riskLevel, decision });

  return {
    policyVersion: POLICY_CONFIG.policyVersion,
    riskScore,
    riskLevel,
    decision,
    confidence,
    summary,
    reasons,
    signals,
    riskBreakdown
  };
}

export const applyPolicy = evaluatePolicy;