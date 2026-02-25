import { evaluatePolicy } from "./policy.js";
import { writeAuditRecord } from "./audit.js";
import type { EvaluateNorthResponse, NorthPolicyInput } from "./types.js";

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

export function normalizeInput(raw: unknown): NorthPolicyInput {
  const obj: Record<string, unknown> = isPlainObject(raw) ? raw : {};

  const env = toStringLower(obj.env, "dev") as NorthPolicyInput["env"];
  const actionType = toStringLower(obj.actionType, "restart") as NorthPolicyInput["actionType"];

  const reversible = toBoolean(obj.reversible, true);
  const blastRadius = toNumber(obj.blastRadius, 0);
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

  // Auditoria: não derruba o endpoint, mas agora loga o resultado
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