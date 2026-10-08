import express from "express";
import cors from "cors";
import { config } from "./config/env.js";
import { checkConnection } from "./config/db.js";

import authRoutes from "./routes/auth.js";
import uploadRoutes from "./routes/upload.js";
import predictionsRoutes from "./routes/predictions.js";
import shapRoutes from "./routes/shap.js";
import whatifRoutes from "./routes/whatif.js";
import recommendationsRoutes from "./routes/recommendations.js";
import tasksRoutes from "./routes/tasks.js";
import monitoringRoutes from "./routes/monitoring.js";
import fleetRoutes from "./routes/fleet.js";
import usersRoutes from "./routes/users.js";

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", async (req, res) => {
  const db = await checkConnection();
  res.json({ status: "ok", database: db, model_version: config.modelVersion });
});

app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/predictions", predictionsRoutes);
app.use("/api/shap", shapRoutes);
app.use("/api/whatif", whatifRoutes);
app.use("/api/recommendations", recommendationsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/monitoring", monitoringRoutes);
app.use("/api/fleet", fleetRoutes);
app.use("/api/users", usersRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(config.port, () => {
  console.log(`🛠️  Predictive Maintenance API listening on http://localhost:${config.port}`);
  console.log(`   ML service target: ${config.mlService.baseUrl}`);
});
