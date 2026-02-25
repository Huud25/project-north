import { evaluatePolicy } from "./policy.js";
import { writeAuditRecord } from "./audit.js";
import type { EvaluateNorthResponse, NorthPolicyInput, Environment, ActionType } from "./types.js";

function isoNow(): string {
  return new Date().toISOString();
}

function makeRequestId(): string {
  return `north_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toBoolean(v: unknown, defaultValue: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  if (typeof v === "number") return v !== 0;
  return defaultValue;
}

function toNumber(v: unknown, defaultValue: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return defaultValue;
}

function toStringLower(v: unknown, defaultValue: string): string {
  if (typeof v === "string" && v.trim().length > 0) return v.trim().toLowerCase();
  return defaultValue;
}

function normalizeEnv(v: unknown, defaultValue: Environment): Environment {
  const s = toStringLower(v, defaultValue);
  if (s === "dev" || s === "staging" || s === "prod") return s;
  return defaultValue;
}

function normalizeActionType(v: unknown, defaultValue: ActionType): ActionType {
  const s = toStringLower(v, defaultValue);
  if (s === "restart" || s === "deploy" || s === "delete" || s === "drop") return s;
  return defaultValue;
}

/**
 * blastRadius expected as number in policy.
 * We'll accept:
 * - number (0..10 recommended, but any finite number works)
 * - string "low|medium|high" -> 1|5|10
 * - string numeric -> number
 */
function normalizeBlastRadius(v: unknown, defaultValue: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "low") return 1;
    if (s === "medium" || s === "med") return 5;
    if (s === "high") return 10;

    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }

  return defaultValue;
}

export function normalizeInput(raw: unknown): NorthPolicyInput {
  const obj: Record<string, unknown> = isPlainObject(raw) ? raw : {};

  // Accept aliases:
  // environment -> env
  // action -> actionType
  const envRaw = obj.env ?? obj.environment;
  const actionRaw = obj.actionType ?? obj.action;

  const env = normalizeEnv(envRaw, "dev");
  const actionType = normalizeActionType(actionRaw, "restart");

  // irreversible / reversible logic:
  // - If reversible is explicitly provided, trust it.
  // - Else if irreversible is provided, set reversible = !irreversible.
  // - Else default reversible = true.
  const hasReversible = Object.prototype.hasOwnProperty.call(obj, "reversible");
  const hasIrreversible = Object.prototype.hasOwnProperty.call(obj, "irreversible");

  let reversible = true;
  if (hasReversible) {
    reversible = toBoolean(obj.reversible, true);
  } else if (hasIrreversible) {
    const irreversible = toBoolean(obj.irreversible, false);
    reversible = !irreversible;
  } else {
    reversible = true;
  }

  const blastRadius = normalizeBlastRadius(obj.blastRadius, 0);
  const governanceMissing = toBoolean(obj.governanceMissing, false);

  return {
    ...obj,
    env,
    actionType,
    reversible,
    blastRadius,
    governanceMissing
  } as NorthPolicyInput;
}

export async function evaluateNorth(rawInput: unknown): Promise<EvaluateNorthResponse> {
  const requestId = makeRequestId();
  const createdAt = isoNow();

  const input = normalizeInput(rawInput);
  const policy = evaluatePolicy(input);

  // Auditoria: não derruba o endpoint, mas loga o resultado
  writeAuditRecord({ requestId, createdAt, input, policy })
    .then((res) => {
      if (res.ok) {
        console.log(`[north-audit] written blob=${res.blobName} decisionId=${res.decisionId}`);
      } else {
        console.error(`[north-audit] FAILED decisionId=${res.decisionId} error=${res.error}`);
      }
    })
    .catch((err) => {
      console.error("[north-audit] FAILED with exception:", err);
    });

  return {
    ok: true,
    requestId,
    timestamp: createdAt,
    input,
    policy
  };
}