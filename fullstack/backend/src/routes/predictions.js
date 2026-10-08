import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { callMlService } from "../services/mlClient.js";
import { readingToFeatureDict } from "../utils/readingMapper.js";

const router = Router();
router.use(requireAuth);

const ENGINEER = "Maintenance Engineer";
const MANAGER = "Maintenance Manager";

const FAILURE_MODES = ["TWF", "HDF", "PWF", "OSF", "RNF"];
// Readings are processed in chunks so a very large upload doesn't build one
// enormous request body or hold a single transaction open indefinitely.
const CHUNK_SIZE = Number(process.env.PREDICTION_CHUNK_SIZE || 250);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Run the full ML + SHAP + recommendation pipeline for every reading in
 * `uploaded_file_id`. Mirrors src/data_ingestion.py:run_predictions_for_file.
 *
 * Uses the ML service's batch endpoints (3 calls per chunk instead of
 * 2 calls per reading) and bulk INSERTs, so a 10k-row upload no longer issues
 * tens of thousands of sequential round-trips.
 */
// Running the pipeline is part of the ingestion workflow - a Maintenance
// Technician views results only, so only an Engineer or Manager can trigger it.
router.post("/run/:uploadedFileId", requireRole(ENGINEER, MANAGER), async (req, res) => {
  const uploadedFileId = parseInt(req.params.uploadedFileId, 10);
  if (Number.isNaN(uploadedFileId)) {
    return res.status(400).json({ error: "Invalid uploaded_file_id." });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const [readings] = await conn.query(
      "SELECT * FROM machine_readings WHERE uploaded_file_id = :id",
      { id: uploadedFileId }
    );
    if (readings.length === 0) {
      return res.json({ n_scored: 0 });
    }

    let nScored = 0;

    for (const batch of chunk(readings, CHUNK_SIZE)) {
      const featureDicts = batch.map(readingToFeatureDict);

      // 1) Predictions for the whole chunk
      const { predictions } = await callMlService("post", "/predict/batch", {
        readings: featureDicts,
      });
      if (!Array.isArray(predictions) || predictions.length !== batch.length) {
        throw new Error(
          `ML service returned ${predictions?.length ?? 0} predictions for ${batch.length} readings.`
        );
      }

      // 2) SHAP explanations for the whole chunk
      const { explanations } = await callMlService("post", "/explain/batch", {
        readings: featureDicts,
      });

      // 3) Recommendations for the whole chunk
      const recItems = batch.map((_, i) => ({
        overall_probability: predictions[i].failure_probability,
        failure_mode_probabilities: Object.fromEntries(
          FAILURE_MODES.map((m) => [m, predictions[i][`prob_${m}`]])
        ),
        shap_rows: explanations[i]?.shap_values || null,
      }));
      const { results: recResults } = await callMlService("post", "/recommendations/batch", {
        items: recItems,
      });

      await conn.beginTransaction();
      try {
        for (let i = 0; i < batch.length; i += 1) {
          const reading = batch[i];
          const pred = predictions[i];

          const [predResult] = await conn.query(
            `INSERT INTO predictions (reading_id, failure_probability, status, model_version)
             VALUES (?, ?, ?, ?)`,
            [reading.id, pred.failure_probability, pred.status, pred.model_version]
          );
          const predictionId = predResult.insertId;

          const modeRows = FAILURE_MODES.map((m) => [predictionId, m, pred[`prob_${m}`]]);
          await conn.query(
            "INSERT INTO failure_mode_predictions (prediction_id, failure_mode, probability) VALUES ?",
            [modeRows]
          );

          const shapValues = explanations[i]?.shap_values || [];
          if (shapValues.length > 0) {
            const shapRows = shapValues.map((r) => [
              predictionId,
              r.feature,
              r.feature_value,
              r.shap_value,
              r.contribution_direction,
            ]);
            await conn.query(
              `INSERT INTO shap_explanations
                 (prediction_id, feature_name, feature_value, shap_value, contribution_direction)
               VALUES ?`,
              [shapRows]
            );
          }

          const recs = recResults[i] || [];
          if (recs.length > 0) {
            const recRows = recs.map((rec) => [
              predictionId,
              rec.failure_mode,
              rec.recommendation_text,
              rec.urgency,
              rec.confidence,
              rec.supporting_features,
              "Pending",
            ]);
            await conn.query(
              `INSERT INTO recommendations
                 (prediction_id, failure_mode, recommendation_text, urgency, confidence,
                  supporting_features, recommendation_status)
               VALUES ?`,
              [recRows]
            );
          }

          nScored += 1;
        }
        await conn.commit();
      } catch (innerErr) {
        await conn.rollback();
        throw innerErr;
      }
    }

    return res.json({ n_scored: nScored });
  } catch (err) {
    console.error("Prediction run error:", err);
    return res
      .status(err.status || 500)
      .json({ error: `Prediction run failed: ${err.message}` });
  } finally {
    if (conn) conn.release();
  }
});

/** Fleet-wide readings joined with their latest prediction, for dashboards. */
router.get("/readings", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        r.id AS reading_id, r.machine_id, r.UDI, r.Product_ID, r.machine_type AS Type,
        r.air_temperature AS \`Air temperature [K]\`,
        r.process_temperature AS \`Process temperature [K]\`,
        r.rotational_speed AS \`Rotational speed [rpm]\`,
        r.torque AS \`Torque [Nm]\`,
        r.tool_wear AS \`Tool wear [min]\`,
        r.reading_timestamp, r.source_filename, r.is_simulated,
        p.id AS prediction_id, p.failure_probability, p.status, p.model_version, p.prediction_timestamp
      FROM machine_readings r
      LEFT JOIN predictions p ON p.reading_id = r.id
      ORDER BY r.created_at DESC
      LIMIT 5000
    `);
    res.json({ readings: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load readings." });
  }
});

/** Failure-mode breakdown for one prediction. */
router.get("/:predictionId/failure-modes", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT failure_mode, probability FROM failure_mode_predictions WHERE prediction_id = :id",
      { id: req.params.predictionId }
    );
    res.json({ failure_modes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load failure modes." });
  }
});

export default router;
