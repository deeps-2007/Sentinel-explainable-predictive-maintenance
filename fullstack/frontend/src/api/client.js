import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

// Most calls are fast, but scoring a large upload (predict -> SHAP ->
// recommendations for every reading) is CPU-bound and can run for minutes,
// so the default ceiling is generous. Pass a smaller/larger `timeout` per
// request where it matters.
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 900_000,
});

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("pdm_token");
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("pdm_token");
      localStorage.removeItem("pdm_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export function apiErrorMessage(err, fallback = "Something went wrong.") {
  return err?.response?.data?.error || err?.message || fallback;
}
