import { BlobServiceClient } from "@azure/storage-blob";
import crypto from "node:crypto";
import { POLICY_CONFIG } from "./policy.config.js";
import type { NorthPolicyInput, NorthPolicyResult } from "./types.js";
import type { NorthAuditRecord } from "./audit.types.js";

function getConnectionString(): string | undefined {
  return process.env.AzureWebJobsStorage || process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.NORTH_STORAGE_CONNECTION_STRING;
}

function getContainerName(): string {
  return process.env.NORTH_AUDIT_CONTAINER || "north-audit";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `"${k}":${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeDecisionId(policyVersion: string, input: NorthPolicyInput): string {
  const payload = `${policyVersion}|${stableStringify(input)}`;
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function safeBlobName(createdAtIso: string, decisionId: string): string {
  const ts = createdAtIso.replace(/[:.]/g, "-");
  return `${ts}_${decisionId}.json`;
}

export async function writeAuditRecord(args: {
  requestId: string;
  createdAt: string;
  input: NorthPolicyInput;
  policy: NorthPolicyResult;
}): Promise<{ ok: true; decisionId: string; blobName: string } | { ok: false; decisionId: string; error: string }> {
  const decisionId = computeDecisionId(args.policy.policyVersion, args.input);

  const conn = getConnectionString();
  if (!conn) {
    return {
      ok: false,
      decisionId,
      error: "Missing storage connection string (AzureWebJobsStorage / AZURE_STORAGE_CONNECTION_STRING / NORTH_STORAGE_CONNECTION_STRING)."
    };
  }

  const record: NorthAuditRecord = {
    auditRecordVersion: "1.0",
    decisionId,
    requestId: args.requestId,
    createdAt: args.createdAt,
    policyVersion: args.policy.policyVersion,
    strictProduction: Boolean((POLICY_CONFIG as unknown as { strictProduction?: boolean }).strictProduction),
    input: args.input,
    policy: args.policy,
    meta: { source: "EvaluateNorth", runtime: "azure-functions" }
  };

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(conn);
    const containerClient = blobServiceClient.getContainerClient(getContainerName());
    await containerClient.createIfNotExists();

    const blobName = safeBlobName(args.createdAt, decisionId);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    const content = JSON.stringify(record, null, 2);
    await blobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: "application/json" }
    });

    return { ok: true, decisionId, blobName };
  } catch (err) {
    return { ok: false, decisionId, error: err instanceof Error ? err.message : String(err) };
  }
}