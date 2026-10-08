import axios from "axios";
import { config } from "../config/env.js";

export const mlClient = axios.create({
  baseURL: config.mlService.baseUrl,
  // SHAP over a large batch is CPU-bound and can legitimately take minutes.
  timeout: Number(process.env.ML_SERVICE_TIMEOUT_MS || 600_000),
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

/**
 * Call the ML service and surface a useful error.
 *
 * The ML service returns {"detail": "..."} for both HTTPException (4xx) and
 * unhandled errors (5xx), so we forward that detail verbatim instead of
 * collapsing everything into "Internal Server Error".
 */
export async function callMlService(method, url, data) {
  try {
    const response = await mlClient.request({ method, url, data });
    return response.data;
  } catch (err) {
    if (err.response) {
      const body = err.response.data;
      const detail =
        (typeof body === "string" ? body : body?.detail || body?.error) || err.response.statusText;
      const wrapped = new Error(`ML service error (${err.response.status}): ${detail}`);
      // 4xx from the ML service is a client-data problem -> surface as 400.
      // 503 means models aren't trained/loadable. Everything else -> 502.
      if (err.response.status === 503) wrapped.status = 503;
      else if (err.response.status >= 400 && err.response.status < 500) wrapped.status = 400;
      else wrapped.status = 502;
      throw wrapped;
    }
    const wrapped = new Error(
      err.code === "ECONNABORTED"
        ? `ML service timed out after ${mlClient.defaults.timeout}ms. Try a smaller upload or raise ML_SERVICE_TIMEOUT_MS.`
        : `Could not reach ML service at ${config.mlService.baseUrl}: ${err.message}`
    );
    wrapped.status = 502;
    throw wrapped;
  }
}
