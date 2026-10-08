import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { callMlService } from "../services/mlClient.js";

const router = Router();
router.use(requireAuth);

/** Ranked recommendations, joined with the originating machine ID. */
router.get("/", async (req, res) => {
  const statusFilter = req.query.status ? String(req.query.status).split(",") : null;
  const machineSearch = req.query.machine_id ? String(req.query.machine_id) : null;

  try {
    let sql = `
      SELECT
        rec.id AS recommendation_id, rec.prediction_id, rec.failure_mode,
        rec.recommendation_text, rec.urgency, rec.confidence,
        rec.supporting_features, rec.recommendation_status,
        p.reading_id, p.failure_probability AS overall_probability, p.status,
        r.machine_id, r.machine_type
      FROM recommendations rec
      JOIN predictions p ON rec.prediction_id = p.id
      JOIN machine_readings r ON p.reading_id = r.id
      WHERE 1 = 1
    `;
    const params = {};

    if (statusFilter && statusFilter.length > 0) {
      sql += " AND rec.recommendation_status IN (:statusFilter)";
      params.statusFilter = statusFilter;
    }
    if (machineSearch) {
      sql += " AND r.machine_id LIKE :machineSearch";
      params.machineSearch = `%${machineSearch}%`;
    }
    sql += " ORDER BY p.failure_probability DESC LIMIT 300";

    const [rows] = await pool.query(sql, params);

    const [countsRaw] = await pool.query(
      "SELECT recommendation_status, COUNT(*) AS n FROM recommendations GROUP BY recommendation_status"
    );
    const counts = { Pending: 0, Approved: 0, Rejected: 0 };
    for (const row of countsRaw) counts[row.recommendation_status] = row.n;

    res.json({ recommendations: rows, counts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load recommendations." });
  }
});

/**
 * Approve or reject a recommendation. This is the Maintenance Engineer's
 * "accept the maintenance task" action - only that role may do it.
 */
router.patch("/:id/status", requireRole("Maintenance Engineer"), async (req, res) => {
  const { status } = req.body;
  if (!["Approved", "Rejected", "Pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  try {
    await pool.query("UPDATE recommendations SET recommendation_status = :status WHERE id = :id", {
      status,
      id: req.params.id,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update recommendation status." });
  }
});

/** Compute recommendations for an ad-hoc scenario (used by the What-If Simulator). */
router.post("/compute", async (req, res) => {
  try {
    const data = await callMlService("post", "/recommendations", req.body);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Could not compute recommendations." });
  }
});

export default router;
