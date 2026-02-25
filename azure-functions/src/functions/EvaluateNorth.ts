import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateNorth } from "../north/evaluator.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function EvaluateNorth(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    let body: Record<string, unknown> = {};
    try {
      const raw = await request.json();
      body = isPlainObject(raw) ? raw : {};
    } catch {
      body = {};
    }

    // query params (strings)
    const query: Record<string, unknown> = {};
    request.query.forEach((value, key) => {
      query[key] = value;
    });

    // Support payloads:
    // 1) { environment, action, ... }
    // 2) { change: { environment, action, ... } }
    const changeFromBody =
      isPlainObject(body.change) ? (body.change as Record<string, unknown>) : null;

    // Merge order (later wins):
    // query -> body -> body.change
    const input: Record<string, unknown> = {
      ...query,
      ...body,
      ...(changeFromBody ?? {})
    };

    const result = await evaluateNorth(input);

    return {
      status: 200,
      jsonBody: result
    };
  } catch (error) {
    context.error("EvaluateNorth error:", error);

    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: "Internal server error"
      }
    };
  }
}

app.http("EvaluateNorth", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: EvaluateNorth
});