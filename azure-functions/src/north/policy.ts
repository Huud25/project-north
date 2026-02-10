import { RiskLevel, Decision, RiskSignals } from "./types.js";

interface PolicyEvaluation {
  riskLevel: RiskLevel;
  decision: Decision;
  confidence: number;
  reasons: string[];
  signals: RiskSignals;
}

export function applyPolicy(
  input: string,
  env: "dev" | "staging" | "prod",
  actionType: string
): PolicyEvaluation {
  const text = input.toLowerCase();

  let score = 0;
  const reasons: string[] = [];
  const governanceMissing: string[] = [];

  if (env === "prod") {
    score += 3;
    reasons.push("production_environment");
  } else if (env === "staging") {
    score += 1;
    reasons.push("staging_environment");
  } else {
    reasons.push("dev_environment");
  }

  const type = (actionType || "other").toLowerCase();
  if (type === "delete") {
    score += 4;
    reasons.push("action_type:delete");
  } else if (type === "secrets") {
    score += 3;
    reasons.push("action_type:secrets");
  } else if (type === "deploy") {
    score += 2;
    reasons.push("action_type:deploy");
  } else if (type === "scale") {
    score += 2;
    reasons.push("action_type:scale");
  } else if (type === "restart") {
    score += 1;
    reasons.push("action_type:restart");
  } else {
    reasons.push("action_type:other");
  }

  const destructiveKeywords = ["drop", "delete", "wipe", "format", "rm -rf"];
  if (destructiveKeywords.some((k) => text.includes(k))) {
    score += 4;
    reasons.push("destructive_action_keyword");
  }

  const stateChangingKeywords = ["deploy", "migration", "rotate", "change firewall", "rbac", "disable auth"];
  if (stateChangingKeywords.some((k) => text.includes(k))) {
    score += 2;
    reasons.push("state_changing_keyword");
  }

  const reversible = !destructiveKeywords.some((k) => text.includes(k)) && type !== "delete";
  if (!reversible) {
    score += 3;
    reasons.push("irreversible_change");
  }

  let blastRadius: "single" | "service" | "platform" = "single";
  if (text.includes("database") || text.includes("auth") || text.includes("rbac") || text.includes("secrets")) {
    blastRadius = "platform";
    score += 3;
    reasons.push("platform_wide_impact");
  } else if (text.includes("service") || type === "deploy" || type === "restart") {
    blastRadius = "service";
    score += 1;
    reasons.push("service_level_impact");
  }

  if (env === "prod") {
    const hasTicket = /chg-\d+|inc-\d+|ticket/i.test(input);
    const hasBackup = /backup/i.test(input);
    const hasApproval = /approved|approval|ok from/i.test(input);

    if (!hasTicket) {
      governanceMissing.push("change_ticket");
      score += 1;
      reasons.push("missing_change_ticket");
    }

    if (!hasBackup && (type === "delete" || text.includes("database") || text.includes("migration"))) {
      governanceMissing.push("backup_verification");
      score += 1;
      reasons.push("missing_backup_verification");
    }

    if (!hasApproval && (type === "deploy" || type === "delete" || blastRadius === "platform")) {
      governanceMissing.push("human_approval");
      score += 1;
      reasons.push("missing_human_approval");
    }
  }

  let riskLevel: RiskLevel = "LOW";
  let decision: Decision = "AUTO";

  if (score >= 10) {
    riskLevel = "CRITICAL";
    decision = "BLOCK";
  } else if (score >= 7) {
    riskLevel = "HIGH";
    decision = "APPROVAL";
  } else if (score >= 4) {
    riskLevel = "MEDIUM";
    decision = "APPROVAL";
  } else {
    riskLevel = "LOW";
    decision = "AUTO";
  }

  const confidence = Math.min(0.55 + score * 0.05, 0.95);

  return {
    riskLevel,
    decision,
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
