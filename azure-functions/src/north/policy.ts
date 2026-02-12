import { Decision, PolicyEvaluation, RiskLevel } from "./types.js";

type Env = "dev" | "staging" | "prod";
type ActionType = string;

type PolicyInput = {
  env: Env;
  actionType: ActionType;
  reversible: boolean;
  blastRadius: string;
  governanceMissing: string[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function riskLevelFromScore(score: number): RiskLevel {
  // score aqui é “pontos” (0..20 aprox). Você já usava algo assim.
  if (score >= 16) return "CRITICAL";
  if (score >= 11) return "HIGH";
  if (score >= 6) return "MEDIUM";
  return "LOW";
}

function decisionFrom(riskLevel: RiskLevel, governanceMissing: string[]): Decision {
  if (riskLevel === "CRITICAL") return "BLOCK";
  if (riskLevel === "HIGH") return "APPROVAL";
  if (governanceMissing.length > 0) return "APPROVAL";
  return "AUTO";
}

export function evaluatePolicy(input: PolicyInput): PolicyEvaluation {
  const { env, actionType, reversible, blastRadius } = input;

  const governanceMissing = (input.governanceMissing ?? []).map(String);

  const reasons: string[] = [];

  // ✅ Score interno em “pontos”
  let score = 0;

  // 1) Ambiente
  if (env === "prod") {
    score += 6;
    reasons.push("production_environment");
  } else if (env === "staging") {
    score += 2;
    reasons.push("staging_environment");
  } else {
    score += 0;
    reasons.push("dev_environment");
  }

  // 2) Tipo de ação (sem inventar termos complexos)
  const action = String(actionType || "").toLowerCase();
  if (action.includes("delete") || action.includes("drop")) {
    score += 8;
    reasons.push("destructive_action");
  } else if (action.includes("deploy")) {
    score += 4;
    reasons.push("deploy_action");
  } else if (action.includes("restart")) {
    score += 1;
    reasons.push("restart_action");
  } else {
    score += 2;
    reasons.push("unknown_action_type");
  }

  // 3) Reversibilidade
  if (!reversible) {
    score += 4;
    reasons.push("not_reversible");
  } else {
    reasons.push("reversible");
  }

  // 4) Alcance do impacto (blast radius)
  const br = String(blastRadius || "").toLowerCase();
  if (br.includes("global") || br.includes("org") || br.includes("all")) {
    score += 6;
    reasons.push("global_impact");
  } else if (br.includes("multi") || br.includes("cluster") || br.includes("platform")) {
    score += 4;
    reasons.push("multi_service_impact");
  } else if (br.includes("service")) {
    score += 2;
    reasons.push("service_level_impact");
  } else {
    score += 2;
    reasons.push("unknown_blast_radius");
  }

  // 5) Governança faltando
  if (governanceMissing.length > 0) {
    score += 3;
    reasons.push("governance_requirements_missing");
  }

  // ✅ riskScore (0..100) derivado do score interno
  // Aqui assumimos “score máximo razoável” ~ 20. Ajustável depois.
  const riskScore = clamp(Math.round((score / 20) * 100), 0, 100);

  const riskLevel = riskLevelFromScore(score);
  const decision = decisionFrom(riskLevel, governanceMissing);

  // ✅ confidence arredondada como você já fez (2 casas)
  const confidence = Number(clamp(0.55 + score * 0.05, 0.55, 0.95).toFixed(2));

  return {
    riskLevel,
    decision,
    riskScore,
    confidence,
    reasons,
    signals: {
      environment: env,
      actionType,
      reversible,
      blastRadius,
      governanceMissing
    }
  };
}

export const applyPolicy = evaluatePolicy;
