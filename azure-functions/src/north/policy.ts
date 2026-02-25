import { POLICY_CONFIG } from "./policy.config.js";

/**
 * IMPORTANTES:
 * - Mantém determinismo: mesmo input => mesmo output
 * - Não depende de relógio/random
 * - Não quebra o endpoint: retorna campos comuns (riskScore, riskLevel, decision, confidence, reasons, signals, riskBreakdown)
 *
 * INPUT esperado (campos usados):
 * - env: "dev" | "staging" | "prod"
 * - actionType: "restart" | "deploy" | "delete" | "drop"
 * - reversible: boolean
 * - blastRadius: number
 * - governanceMissing: boolean
 */

// Tipos leves pra não acoplar forte (evita quebrar se seu types.ts tiver nomes diferentes)
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
  riskScore: number; // 0..100
  riskLevel: NorthRiskLevel;
  decision: NorthPolicyDecision;
  confidence: number; // 0..1
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
  // Se reversible === true => 0, senão penaliza
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

function getDecision(riskLevel: NorthRiskLevel, governanceMissing: boolean | undefined, env: string | undefined): NorthPolicyDecision {
  const e = (env ?? "").toLowerCase();

  // Strict-ish: se governance está faltando em prod, nunca AUTO.
  if (e === "prod" && governanceMissing) {
    if (riskLevel === "LOW") return "APPROVAL";
    return "BLOCK";
  }

  // Regra padrão por nível
  if (riskLevel === "CRITICAL") return "BLOCK";
  if (riskLevel === "HIGH") return "APPROVAL";
  if (riskLevel === "MEDIUM") return "APPROVAL";
  return "AUTO";
}

function getConfidence(score: number, riskLevel: NorthRiskLevel, governanceMissing: boolean | undefined): number {
  // Confiança determinística, simples e explicável:
  // - mais confiança quanto mais extremo o score
  // - perde confiança se governanceMissing=true (faltando evidência/controle)
  const extremity = Math.abs(score - 50) / 50; // 0..1
  const base =
    riskLevel === "CRITICAL" || riskLevel === "LOW"
      ? 0.85 + 0.1 * extremity
      : 0.75 + 0.1 * extremity;

  const penalty = governanceMissing ? 0.12 : 0;
  return clamp(round2(base - penalty), 0.5, 0.99);
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

  // Sempre inclui uma razão objetiva baseada no total
  reasons.push(`Score final: ${breakdown.total}/100 (${riskLevel}).`);

  return reasons;
}

function buildSignals(input: NorthPolicyInput, decision: NorthPolicyDecision, riskLevel: NorthRiskLevel): NorthPolicyResult["signals"] {
  const env = (input.env ?? "").toLowerCase();
  const action = (input.actionType ?? "").toLowerCase();

  const signals: NorthPolicyResult["signals"] = [
    { key: "env", value: env, severity: env === "prod" ? "warning" : "info" },
    { key: "actionType", value: action, severity: action === "drop" || action === "delete" ? "warning" : "info" },
    { key: "reversible", value: !!input.reversible, severity: input.reversible ? "info" : "warning" },
    { key: "blastRadius", value: input.blastRadius ?? 0, severity: (input.blastRadius ?? 0) >= 6 ? "warning" : "info" },
    { key: "governanceMissing", value: !!input.governanceMissing, severity: input.governanceMissing ? "critical" : "info" },
    { key: "riskLevel", value: riskLevel, severity: riskLevel === "CRITICAL" ? "critical" : riskLevel === "HIGH" ? "warning" : "info" },
    { key: "decision", value: decision, severity: decision === "BLOCK" ? "critical" : decision === "APPROVAL" ? "warning" : "info" }
  ];

  return signals;
}

/**
 * Função principal
 */
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

  return {
    policyVersion: POLICY_CONFIG.policyVersion,
    riskScore,
    riskLevel,
    decision,
    confidence,
    reasons,
    signals,
    riskBreakdown
  };
}

/**
 * Alias de compatibilidade (caso algum arquivo ainda importe applyPolicy).
 */
export const applyPolicy = evaluatePolicy;