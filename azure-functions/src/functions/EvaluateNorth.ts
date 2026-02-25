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

    const query: Record<string, unknown> = {};
    request.query.forEach((value, key) => {
      query[key] = value;
    });

    const input: Record<string, unknown> = {
      ...query,
      ...body
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