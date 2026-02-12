import {
  Decision,
  GuardrailHit,
  PolicyEvaluation,
  RiskFactorBreakdown,
  RiskLevel,
  RiskSignals,
} from "./types.js";

type Env = "dev" | "staging" | "prod";
type ActionType = string;

type PolicyInput = {
  env: Env;
  actionType: ActionType;
  reversible: boolean;
  blastRadius: string;
  governanceMissing: string[];

  // opcionais (não usados ainda no evaluator, mas já suportados)
  assetCriticality?: "TIER_0" | "TIER_1" | "TIER_2";
  changeWindow?: "BUSINESS_HOURS" | "OFF_HOURS" | "FREEZE";
  privilegeLevel?: "LOW" | "MEDIUM" | "HIGH";
};

const POLICY_VERSION = "2026.02";
const RISK_MODEL = "weighted_v1";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function includesAny(s: string, needles: string[]): boolean {
  return needles.some((n) => s.includes(n));
}

function riskLevelFromScore100(score: number): RiskLevel {
  // enterprise-friendly thresholds (0..100)
  if (score >= 85) return "CRITICAL";
  if (score >= 65) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
}

function baseDecisionFrom(riskLevel: RiskLevel): Decision {
  if (riskLevel === "CRITICAL") return "BLOCK";
  if (riskLevel === "HIGH") return "APPROVAL";
  if (riskLevel === "MEDIUM") return "APPROVAL"; // enterprise: médio pede humano por padrão
  return "AUTO";
}

type PolicyConfig = {
  version: string;
  model: string;
  weights: Record<RiskFactorBreakdown["factor"], number>; // pontos
};

const POLICY: PolicyConfig = {
  version: POLICY_VERSION,
  model: RISK_MODEL,
  // ✅ pesos em pontos (soma ≈ 100)
  weights: {
    environment: 22,
    actionType: 20,
    blastRadius: 20,
    reversible: 14,
    governanceMissing: 24,

    // opcionais (se não vierem, severidade 0)
    assetCriticality: 0,
    changeWindow: 0,
    privilegeLevel: 0,
  },
};

function severityEnvironment(env: Env): { sev: number; why: string } {
  if (env === "prod") return { sev: 1.0, why: "prod increases risk due to customer impact" };
  if (env === "staging") return { sev: 0.45, why: "staging has moderate risk due to pre-prod parity" };
  return { sev: 0.15, why: "dev is lower risk by default" };
}

function severityActionType(actionType: string): { sev: number; why: string; reasonTag: string } {
  const a = norm(actionType);

  if (includesAny(a, ["iam", "permission", "role", "rbac", "policy", "grant", "revoke"])) {
    return { sev: 1.0, why: "access control changes are high impact", reasonTag: "access_control_change" };
  }
  if (includesAny(a, ["delete", "drop", "destroy", "purge", "truncate"])) {
    return { sev: 0.95, why: "destructive actions are high risk", reasonTag: "destructive_action" };
  }
  if (includesAny(a, ["network", "firewall", "security group", "nsg", "route", "dns"])) {
    return { sev: 0.9, why: "network/security changes can cause broad outages", reasonTag: "network_security_change" };
  }
  if (includesAny(a, ["infra", "terraform", "bicep", "arm", "k8s", "cluster"])) {
    return { sev: 0.8, why: "infrastructure changes carry systemic risk", reasonTag: "infrastructure_change" };
  }
  if (includesAny(a, ["deploy", "release", "rollout"])) {
    return { sev: 0.65, why: "deployments can introduce regressions", reasonTag: "deploy_action" };
  }
  if (includesAny(a, ["restart", "reboot", "roll", "cycle"])) {
    return { sev: 0.35, why: "restart is usually recoverable but can cause downtime", reasonTag: "restart_action" };
  }

  return { sev: 0.55, why: "unknown action type defaults to moderate risk", reasonTag: "unknown_action_type" };
}

function severityBlastRadius(br: string): { sev: number; why: string; reasonTag: string } {
  const s = norm(br);

  if (includesAny(s, ["global", "org", "all", "tenant", "entire"])) {
    return { sev: 1.0, why: "global impact affects many services/users", reasonTag: "global_impact" };
  }
  if (includesAny(s, ["multi", "cluster", "platform", "shared", "fleet"])) {
    return { sev: 0.8, why: "multi-service/platform impact is high", reasonTag: "multi_service_impact" };
  }
  if (includesAny(s, ["region", "zone"])) {
    return { sev: 0.7, why: "regional impact is significant", reasonTag: "regional_impact" };
  }
  if (includesAny(s, ["service", "app"])) {
    return { sev: 0.5, why: "service-level impact is moderate", reasonTag: "service_level_impact" };
  }
  if (includesAny(s, ["single", "one", "node", "instance"])) {
    return { sev: 0.3, why: "single instance impact is lower", reasonTag: "single_instance_impact" };
  }

  return { sev: 0.6, why: "unknown blast radius defaults to moderate-high", reasonTag: "unknown_blast_radius" };
}

function severityReversible(reversible: boolean): { sev: number; why: string; reasonTag: string } {
  if (reversible) return { sev: 0.2, why: "rollback is possible", reasonTag: "reversible" };
  return { sev: 1.0, why: "irreversible changes increase risk", reasonTag: "not_reversible" };
}

function severityGovernanceMissing(missing: string[]): { sev: number; why: string; reasonTag: string } {
  const list = (missing ?? []).map((x) => norm(x)).filter(Boolean);
  if (list.length === 0) return { sev: 0.0, why: "governance controls present", reasonTag: "governance_ok" };

  // Heurística enterprise: faltas críticas pesam mais
  const critical = list.some((x) =>
    includesAny(x, ["approval", "change ticket", "cab", "no_approval", "no_ticket", "policy"])
  );
  const moderate = list.some((x) => includesAny(x, ["runbook", "alerts", "monitor", "rollback", "owner", "slo"]));

  const sev = critical ? 1.0 : moderate ? 0.7 : 0.55;

  return {
    sev,
    why: critical
      ? "missing critical governance (approval/ticket/policy)"
      : moderate
      ? "missing operational governance (runbook/alerts/rollback readiness)"
      : "governance gaps detected",
    reasonTag: "governance_requirements_missing",
  };
}

function computeBreakdown(input: PolicyInput): {
  breakdown: RiskFactorBreakdown[];
  score100: number;
  reasonTags: string[];
} {
  const breakdown: RiskFactorBreakdown[] = [];
  const reasonTags: string[] = [];

  const add = (
    factor: RiskFactorBreakdown["factor"],
    inputValue: unknown,
    sevObj: { sev: number; why: string; reasonTag?: string }
  ) => {
    const weight = POLICY.weights[factor] ?? 0;
    const severity = clamp(sevObj.sev, 0, 1);
    const contribution = Math.round(weight * severity);

    breakdown.push({
      factor,
      input: inputValue,
      severity,
      weight,
      contribution,
      rationale: sevObj.why,
    });

    if (sevObj.reasonTag) reasonTags.push(sevObj.reasonTag);
  };

  add("environment", input.env, severityEnvironment(input.env));
  const act = severityActionType(input.actionType);
  add("actionType", input.actionType, act);
  const br = severityBlastRadius(input.blastRadius);
  add("blastRadius", input.blastRadius, br);
  const rev = severityReversible(input.reversible);
  add("reversible", input.reversible, rev);
  const gov = severityGovernanceMissing(input.governanceMissing ?? []);
  add("governanceMissing", input.governanceMissing ?? [], gov);

  // (opcionais — por enquanto peso 0)
  if (input.assetCriticality) {
    add("assetCriticality", input.assetCriticality, {
      sev: input.assetCriticality === "TIER_0" ? 1 : input.assetCriticality === "TIER_1" ? 0.7 : 0.4,
      why: "asset criticality influences risk",
      reasonTag: "asset_criticality",
    });
  }
  if (input.changeWindow) {
    add("changeWindow", input.changeWindow, {
      sev: input.changeWindow === "FREEZE" ? 1 : input.changeWindow === "OFF_HOURS" ? 0.6 : 0.3,
      why: "timing affects operational risk",
      reasonTag: "change_window",
    });
  }
  if (input.privilegeLevel) {
    add("privilegeLevel", input.privilegeLevel, {
      sev: input.privilegeLevel === "HIGH" ? 1 : input.privilegeLevel === "MEDIUM" ? 0.6 : 0.3,
      why: "higher privilege increases blast potential",
      reasonTag: "privilege_level",
    });
  }

  const raw = breakdown.reduce((sum, b) => sum + b.contribution, 0);
  const score100 = clamp(raw, 0, 100);

  return { breakdown, score100, reasonTags };
}

function computeSynergies(input: PolicyInput): { id: string; delta: number; rationale: string }[] {
  const adj: { id: string; delta: number; rationale: string }[] = [];

  const env = input.env;
  const action = norm(input.actionType);
  const br = norm(input.blastRadius);
  const gov = (input.governanceMissing ?? []).map(norm);

  const isDestructive = includesAny(action, ["delete", "drop", "destroy", "purge", "truncate"]);
  const isAccess = includesAny(action, ["iam", "permission", "role", "rbac", "grant", "revoke", "policy"]);
  const isGlobal = includesAny(br, ["global", "org", "all", "tenant", "entire"]);
  const missingCriticalGov = gov.some((x) => includesAny(x, ["approval", "ticket", "cab", "policy", "no_approval", "no_ticket"]));

  // Sinergias típicas de empresa (a soma simples subestima)
  if (env === "prod" && !input.reversible) {
    adj.push({ id: "prod_irreversible", delta: 6, rationale: "prod + irreversible amplifies impact" });
  }
  if (env === "prod" && isGlobal) {
    adj.push({ id: "prod_global", delta: 5, rationale: "prod + global blast radius amplifies risk" });
  }
  if (env === "prod" && isDestructive) {
    adj.push({ id: "prod_destructive", delta: 6, rationale: "prod + destructive action is high risk" });
  }
  if (env === "prod" && isAccess) {
    adj.push({ id: "prod_access_control", delta: 6, rationale: "prod + access control changes are high risk" });
  }
  if (env === "prod" && missingCriticalGov) {
    adj.push({ id: "prod_missing_critical_governance", delta: 7, rationale: "prod + missing critical governance increases risk" });
  }

  return adj;
}

function computeGuardrails(input: PolicyInput): GuardrailHit[] {
  const hits: GuardrailHit[] = [];
  const action = norm(input.actionType);
  const br = norm(input.blastRadius);
  const gov = (input.governanceMissing ?? []).map(norm);

  const isDestructive = includesAny(action, ["delete", "drop", "destroy", "purge", "truncate"]);
  const isAccess = includesAny(action, ["iam", "permission", "role", "rbac", "grant", "revoke", "policy"]);
  const isGlobal = includesAny(br, ["global", "org", "all", "tenant", "entire"]);
  const missingCriticalGov = gov.some((x) =>
    includesAny(x, ["approval", "change ticket", "cab", "no_approval", "no_ticket", "policy"])
  );

  // Guardrail 1: PROD + governança crítica faltando => nunca AUTO
  if (input.env === "prod" && missingCriticalGov) {
    hits.push({
      id: "GR_PROD_MISSING_CRITICAL_GOV",
      effect: "REQUIRE_APPROVAL",
      rationale: "Production change missing critical governance (approval/ticket/policy).",
    });
  }

  // Guardrail 2: PROD + IAM/permissions => pelo menos APPROVAL
  if (input.env === "prod" && isAccess) {
    hits.push({
      id: "GR_PROD_ACCESS_CONTROL",
      effect: "REQUIRE_APPROVAL",
      rationale: "Access control changes in production require human approval.",
    });
  }

  // Guardrail 3: PROD + destructive + global + irreversible => BLOCK
  if (input.env === "prod" && isDestructive && isGlobal && !input.reversible) {
    hits.push({
      id: "GR_PROD_DESTRUCTIVE_GLOBAL_IRREV",
      effect: "BLOCK",
      rationale: "Irreversible destructive change with global impact in production is blocked by policy.",
    });
  }

  return hits;
}

function applyGuardrails(decision: Decision, hits: GuardrailHit[]): Decision {
  let d = decision;

  // se qualquer hit for BLOCK, acabou
  if (hits.some((h) => h.effect === "BLOCK")) return "BLOCK";

  // senão, se tiver REQUIRE_APPROVAL e decisão seria AUTO, sobe pra APPROVAL
  if (hits.some((h) => h.effect === "REQUIRE_APPROVAL") && d === "AUTO") d = "APPROVAL";

  return d;
}

function computeConfidence(input: PolicyInput, breakdown: RiskFactorBreakdown[]): number {
  // Confiança baseada em “qualidade do sinal” + consistência
  let c = 0.78;

  const action = norm(input.actionType);
  const br = norm(input.blastRadius);

  const unknownAction = action.length === 0;
  const unknownBR = br.length === 0 || includesAny(br, ["unknown"]);
  const hasGov = (input.governanceMissing ?? []).length === 0;

  if (unknownAction) c -= 0.12;
  if (unknownBR) c -= 0.08;
  if (hasGov) c += 0.04;

  // Se muita coisa está em severidade “default”, baixa um pouco
  const defaults = breakdown.filter((b) =>
    (b.factor === "actionType" && b.rationale.includes("unknown")) ||
    (b.factor === "blastRadius" && b.rationale.includes("unknown"))
  ).length;
  c -= defaults * 0.04;

  // clamp 0.55..0.95 (mantém o seu estilo)
  return Number(clamp(c, 0.55, 0.95).toFixed(2));
}

export function evaluatePolicy(input: PolicyInput): PolicyEvaluation {
  const governanceMissing = (input.governanceMissing ?? []).map(String);

  const { breakdown, score100, reasonTags } = computeBreakdown({
    ...input,
    governanceMissing,
  });

  const synergies = computeSynergies({ ...input, governanceMissing });
  const synergyDelta = synergies.reduce((sum, a) => sum + a.delta, 0);

  const scoreWithAdj = clamp(score100 + synergyDelta, 0, 100);
  const riskLevel = riskLevelFromScore100(scoreWithAdj);

  // decisão base (enterprise)
  let decision = baseDecisionFrom(riskLevel);

  // ajuste: se LOW mas tem governança faltando, não é AUTO
  if (riskLevel === "LOW" && governanceMissing.length > 0) {
    decision = "APPROVAL";
  }

  // guardrails podem sobrescrever
  const guardrailHits = computeGuardrails({ ...input, governanceMissing });
  decision = applyGuardrails(decision, guardrailHits);

  // reasons explicáveis: top fatores + guardrails + algumas tags
  const top = [...breakdown]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((b) => `factor_${b.factor}`);

  const reasons = [
    ...new Set([
      ...top,
      ...reasonTags,
      ...guardrailHits.map((g) => g.id),
      ...(synergies.length ? ["synergy_adjustments_applied"] : []),
    ]),
  ];

  const confidence = computeConfidence({ ...input, governanceMissing }, breakdown);

  const signals: RiskSignals = {
    environment: input.env,
    actionType: input.actionType,
    reversible: input.reversible,
    blastRadius: input.blastRadius,
    governanceMissing,

    assetCriticality: input.assetCriticality,
    changeWindow: input.changeWindow,
    privilegeLevel: input.privilegeLevel,
  };

  return {
    riskLevel,
    decision,
    riskScore: scoreWithAdj,
    confidence,
    reasons,
    signals,

    // extras enterprise (não quebra nada)
    policyVersion: POLICY.version,
    riskModel: POLICY.model,
    factorBreakdown: breakdown,
    synergyAdjustments: synergies,
    guardrailHits,
  };
}

export const applyPolicy = evaluatePolicy;
