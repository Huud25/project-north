import { evaluatePolicy } from "./policy.js";
import type { EvaluateNorthResponse, NorthPolicyInput } from "./types.js";

function isoNow(): string {
  return new Date().toISOString();
}

function makeRequestId(): string {
  // determinístico não precisa aqui; requestId é só rastreio/observabilidade
  // (não entra na policy, então não quebra determinismo do motor)
  return `north_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

/**
 * Normaliza entrada vinda do HTTP (body/query) para o tipo NorthPolicyInput
 * sem deixar TypeScript explodir e sem “inventar” campos.
 */
export function normalizeInput(raw: unknown): NorthPolicyInput {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const env = toStringLower(obj.env, "dev") as NorthPolicyInput["env"];
  const actionType = toStringLower(obj.actionType, "restart") as NorthPolicyInput["actionType"];

  const reversible = toBoolean(obj.reversible, true);
  const blastRadius = toNumber(obj.blastRadius, 0);
  const governanceMissing = toBoolean(obj.governanceMissing, false);

  // mantém campos extras para auditoria/debug, mas o motor ignora o que não usa
  return {
    ...obj,
    env,
    actionType,
    reversible,
    blastRadius,
    governanceMissing
  } as NorthPolicyInput;
}

/**
 * Monta a resposta final do endpoint (estrutura estável, enterprise).
 */
export function evaluateNorth(rawInput: unknown): EvaluateNorthResponse {
  const input = normalizeInput(rawInput);
  const policy = evaluatePolicy(input);

  return {
    ok: true,
    requestId: makeRequestId(),
    timestamp: isoNow(),
    input,
    policy
  };
}