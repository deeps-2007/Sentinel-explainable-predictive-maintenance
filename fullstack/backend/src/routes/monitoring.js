import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { callMlService } from "../services/mlClient.js";

const router = Router();
router.use(requireAuth);

router.get("/training-metrics", async (req, res) => {
  try {
    const data = await callMlService("get", "/training-metrics");
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/model-version", async (req, res) => {
  try {
    const data = await callMlService("get", "/model-version");
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/predictions", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, r.machine_id, r.machine_type
      FROM predictions p
      JOIN machine_readings r ON p.reading_id = r.id
      ORDER BY p.prediction_timestamp DESC
      LIMIT 2000
    `);
    res.json({ predictions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load prediction history." });
  }
});

router.get("/feedback", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM user_feedback ORDER BY created_at DESC LIMIT 50"
    );
    res.json({ feedback: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load feedback." });
  }
});

router.get("/completed-tasks", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM maintenance_tasks WHERE status IN ('Completed', 'Verified')
      ORDER BY completed_at DESC LIMIT 50
    `);
    res.json({ tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load completed tasks." });
  }
});

router.post("/feedback", async (req, res) => {
  const {
    prediction_id: predictionId,
    maintenance_task_id: maintenanceTaskId,
    actual_failure_mode: actualFailureMode,
    action_performed: actionPerformed,
    recommendation_was_useful: wasUseful,
    feedback_text: feedbackText,
  } = req.body || {};

  try {
    const [result] = await pool.query(
      `INSERT INTO user_feedback
         (prediction_id, maintenance_task_id, actual_failure_mode, action_performed,
          recommendation_was_useful, feedback_text)
       VALUES (:predictionId, :maintenanceTaskId, :actualFailureMode, :actionPerformed,
               :wasUseful, :feedbackText)`,
      {
        predictionId: predictionId || null,
        maintenanceTaskId: maintenanceTaskId || null,
        actualFailureMode: actualFailureMode || null,
        actionPerformed: actionPerformed || null,
        wasUseful: wasUseful === undefined ? null : !!wasUseful,
        feedbackText: feedbackText || null,
      }
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not submit feedback." });
  }
});

export default router;
