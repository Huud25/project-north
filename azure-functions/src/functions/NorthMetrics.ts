import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { computeNorthMetrics } from "../north/metrics.js";

export async function NorthMetrics(
  _req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const metrics = await computeNorthMetrics();

    return {
      status: 200,
      jsonBody: {
        ok: true,
        metrics
      }
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    context.error("NorthMetrics error:", err);

    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: msg
      }
    };
  }
}

app.http("NorthMetrics", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: NorthMetrics
});