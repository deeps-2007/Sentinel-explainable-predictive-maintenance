import dotenv from "dotenv";

dotenv.config();

function requireEnv(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return value;
}

export const config = {
  port: parseInt(requireEnv("PORT", "4000"), 10),

  db: {
    host: requireEnv("DB_HOST", "localhost"),
    port: parseInt(requireEnv("DB_PORT", "3306"), 10),
    user: requireEnv("DB_USER", "root"),
    password: requireEnv("DB_PASSWORD", ""),
    database: requireEnv("DB_NAME", "predictive_maintenance"),
    connectionLimit: parseInt(requireEnv("DB_POOL_SIZE", "10"), 10),
  },

  jwt: {
    secret: requireEnv("JWT_SECRET", "change_this_secret_in_production"),
    expiresIn: requireEnv("JWT_EXPIRES_IN", "12h"),
  },

  mlService: {
    baseUrl: requireEnv("ML_SERVICE_URL", "http://127.0.0.1:8001"),
  },

  risk: {
    warning: parseFloat(requireEnv("RISK_THRESHOLD_WARNING", "0.30")),
    critical: parseFloat(requireEnv("RISK_THRESHOLD_CRITICAL", "0.70")),
  },

  modelVersion: requireEnv("MODEL_VERSION", "v1.0.0"),
  corsOrigin: requireEnv("CORS_ORIGIN", "http://localhost:5173"),
};

export function riskLabel(probability) {
  if (probability >= config.risk.critical) return "Critical";
  if (probability >= config.risk.warning) return "Warning";
  return "Healthy";
}
