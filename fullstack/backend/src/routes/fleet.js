import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/summary", async (req, res) => {
  try {
    const [[totals]] = await pool.query("SELECT COUNT(*) AS total_readings FROM machine_readings");
    const [statusCounts] = await pool.query(`
      SELECT status, COUNT(*) AS n, AVG(failure_probability) AS avg_prob
      FROM predictions GROUP BY status
    `);
    const [[avgRow]] = await pool.query(
      "SELECT AVG(failure_probability) AS avg_probability FROM predictions"
    );
    const [topRisk] = await pool.query(`
      SELECT r.machine_id, r.machine_type AS Type, p.failure_probability, p.status, p.prediction_timestamp
      FROM predictions p
      JOIN machine_readings r ON p.reading_id = r.id
      ORDER BY p.failure_probability DESC
      LIMIT 10
    `);
    const [recentFiles] = await pool.query(
      "SELECT * FROM uploaded_files ORDER BY upload_date DESC LIMIT 10"
    );
    const [openTasks] = await pool.query(`
      SELECT * FROM maintenance_tasks WHERE status IN ('Open', 'Assigned', 'In Progress')
      ORDER BY created_at DESC LIMIT 10
    `);

    const counts = { Healthy: 0, Warning: 0, Critical: 0 };
    for (const row of statusCounts) counts[row.status] = row.n;

    res.json({
      total_readings: totals.total_readings,
      status_counts: counts,
      average_probability: avgRow.avg_probability,
      top_risk_machines: topRisk,
      recent_files: recentFiles,
      open_tasks: openTasks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load fleet summary." });
  }
});

/** Failure probability histogram + failure-mode distribution for charts. */
router.get("/distributions", async (req, res) => {
  try {
    const [probs] = await pool.query(
      "SELECT failure_probability, status FROM predictions"
    );
    res.json({ predictions: probs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load distributions." });
  }
});

export default router;
