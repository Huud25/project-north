import { BlobServiceClient } from "@azure/storage-blob";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function recordAuditToBlob(params: {
  auditId?: string;
  input?: unknown;
  env?: Record<string, unknown> | undefined;
  actionType?: string;
  evaluation?: unknown;
}) {
  const containerName = process.env.NORTH_AUDIT_CONTAINER || "north-audit";

  const conn = mustGetEnv("AzureWebJobsStorage");
  const blobService = BlobServiceClient.fromConnectionString(conn);
  const container = blobService.getContainerClient(containerName);

  await container.createIfNotExists();

  const auditId = params.auditId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const blobName = `audits/${auditId}.json`;
  const blob = container.getBlockBlobClient(blobName);

  const record = {
    audit_id: auditId,
    timestamp: new Date().toISOString(),
    input: params.input,
    env: params.env,
    type: params.actionType,
    evaluation: params.evaluation
  };

  const content = JSON.stringify(record, null, 2);
  await blob.upload(content, Buffer.byteLength(content));

  return { auditId, blobName };
}
