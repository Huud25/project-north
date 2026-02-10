import { RiskLevel, Decision } from "./types";

interface PolicyResult {
  risk: RiskLevel;
  decision: Decision;
  confidence: number;
  reasons: string[];
}

const CRITICAL_KEYWORDS = [
  "drop database",
  "delete production",
  "rm -rf",
  "disable auth",
  "wipe",
  "exfiltrate",
  "payment"
];

const HIGH_KEYWORDS = [
  "prod deploy",
  "production deploy",
  "scale down prod",
  "change firewall",
  "rotate secrets",
  "ssh",
  "rbac"
];

const MEDIUM_KEYWORDS = [
  "deploy staging",
  "restart production",
  "db migration"
];

export function applyPolicy(input: string, env: string): PolicyResult {
  const text = input.toLowerCase();

  const reasons: string[] = [];
  let confidence = 0.6;

  if (env === "prod" || env === "production") {
    reasons.push("production_environment");
    confidence += 0.15;
  }

  for (const k of CRITICAL_KEYWORDS) {
    if (text.includes(k)) {
      reasons.push(`critical_keyword:${k}`);
      return {
        risk: "CRITICAL",
        decision: "BLOCK",
        confidence: Math.min(confidence + 0.3, 0.95),
        reasons
      };
    }
  }

  for (const k of HIGH_KEYWORDS) {
    if (text.includes(k)) {
      reasons.push(`high_risk_keyword:${k}`);
      return {
        risk: "HIGH",
        decision: "APPROVAL",
        confidence: Math.min(confidence + 0.25, 0.9),
        reasons
      };
    }
  }

  for (const k of MEDIUM_KEYWORDS) {
    if (text.includes(k)) {
      reasons.push(`medium_risk_keyword:${k}`);
      return {
        risk: "MEDIUM",
        decision: "APPROVAL",
        confidence: Math.min(confidence + 0.15, 0.85),
        reasons
      };
    }
  }

  reasons.push("low_risk_default");
  return {
    risk: "LOW",
    decision: "AUTO",
    confidence: Math.min(confidence, 0.8),
    reasons
  };
}
