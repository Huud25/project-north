import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateChange } from "../north/evaluator.js";
import { recordAuditToBlob } from "../north/audit.js";

type Env = "dev" | "staging" | "prod";

type ReqBody = {
  request?: string;
  env?: Env;
  type?: string;
};

export async function EvaluateNorthHttp(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const requestText = body.request || req.query.get("request") || "";
    const env = (body.env || (req.query.get("env") as Env) || "dev") as Env;
    const type = body.type || req.query.get("type") || "other";

    if (!requestText.trim()) {
      return {
        status: 400,
        jsonBody: { error: "Missing 'request' (JSON body or querystring)" }
      };
    }

    const evaluation = evaluateChange(requestText, env, type);

    const audit = await recordAuditToBlob({
      input: requestText,
      env: env as unknown as Record<string, unknown>,
      actionType: type,
      evaluation
    });

    return {
      status: 200,
      jsonBody: {
        ...evaluation,
        audit_id: audit.auditId,
        audit_blob: audit.blobName,
        request: requestText,
        environment: env,
        type
      }
    };
  } catch (err: any) {
    context.error(err);
    return {
      status: 500,
      jsonBody: {
        error: "Internal error",
        detail: String(err?.message || err)
      }
    };
  }
}

app.http("EvaluateNorth", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: EvaluateNorthHttp
});
