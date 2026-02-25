import type { NorthPolicyInput, NorthPolicyResult } from "./types.js";

export type AuditRecordVersion = "1.0";

export type NorthAuditRecord = {
  auditRecordVersion: AuditRecordVersion;

  decisionId: string; // hash determinístico da policyVersion + input normalizado
  requestId: string;  // id do request (rastreio)

  createdAt: string;  // ISO timestamp

  // “Config snapshot” relevante para governança
  policyVersion: string;
  strictProduction: boolean;

  // Input normalizado + resultado do motor
  input: NorthPolicyInput;
  policy: NorthPolicyResult;

  // Metadados úteis (não afetam determinismo do motor)
  meta: {
    source: "EvaluateNorth";
    runtime: "azure-functions";
  };
};