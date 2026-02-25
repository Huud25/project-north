import { BlobServiceClient } from "@azure/storage-blob";
import type { NorthAuditRecord } from "./audit.types.js";

function getConnectionString(): string | undefined {
  return (
    process.env.AzureWebJobsStorage ||
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    process.env.NORTH_STORAGE_CONNECTION_STRING
  );
}

function getContainerName(): string {
  return process.env.NORTH_AUDIT_CONTAINER || "north-audit";
}

function isAuditRecord(v: unknown): v is NorthAuditRecord {
  return typeof v === "object" && v !== null && (v as any).auditRecordVersion === "1.0";
}

type Metrics = {
  totalDecisions: number;
  byRiskLevel: Record<string, number>;
  byDecision: Record<string, number>;
  byPolicyVersion: Record<string, number>;
  latestCreatedAt?: string;
};

function bump(map: Record<string, number>, key: string | undefined) {
  const k = key ?? "UNKNOWN";
  map[k] = (map[k] ?? 0) + 1;
}

export async function computeNorthMetrics(): Promise<Metrics> {
  const conn = getConnectionString();
  if (!conn) {
    throw new Error("Missing storage connection string for metrics.");
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(conn);
  const containerClient = blobServiceClient.getContainerClient(getContainerName());

  const metrics: Metrics = {
    totalDecisions: 0,
    byRiskLevel: {},
    byDecision: {},
    byPolicyVersion: {},
    latestCreatedAt: undefined
  };

  const exists = await containerClient.exists();
  if (!exists) return metrics;

  for await (const blob of containerClient.listBlobsFlat()) {
    if (!blob.name.endsWith(".json")) continue;

    const blobClient = containerClient.getBlobClient(blob.name);
    const downloaded = await blobClient.download();

    const stream = downloaded.readableStreamBody;
    if (!stream) continue;

    const text = await streamToString(stream);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }

    if (!isAuditRecord(parsed)) continue;

    metrics.totalDecisions += 1;
    bump(metrics.byRiskLevel, parsed.policy?.riskLevel);
    bump(metrics.byDecision, parsed.policy?.decision);
    bump(metrics.byPolicyVersion, parsed.policyVersion);

    if (!metrics.latestCreatedAt || parsed.createdAt > metrics.latestCreatedAt) {
      metrics.latestCreatedAt = parsed.createdAt;
    }
  }

  return metrics;
}

async function streamToString(readable: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8");
}