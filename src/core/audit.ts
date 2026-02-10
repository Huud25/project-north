import fs from "fs";
import path from "path";
import { EvaluationResult } from "./types";

export function recordAudit(
  input: string,
  env: string,
  evaluation: EvaluationResult
): string {
  const auditId = `${new Date().toISOString()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;

  const record = {
    audit_id: auditId,
    timestamp: new Date().toISOString(),
    input,
    env,
    evaluation
  };

  const auditDir = path.join(process.cwd(), "docs");
  const auditFile = path.join(auditDir, "audit-log.jsonl");

  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }

  fs.appendFileSync(auditFile, JSON.stringify(record) + "\n");

  return auditId;
}
