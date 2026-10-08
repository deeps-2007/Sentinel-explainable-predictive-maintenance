import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { callMlService } from "../services/mlClient.js";
import { readingToFeatureDict } from "../utils/readingMapper.js";

const router = Router();
router.use(requireAuth);

router.get("/fields", async (req, res) => {
  try {
    const data = await callMlService("get", "/whatif/fields");
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

async function getReadingFeatureDict(readingId) {
  const [rows] = await pool.query("SELECT * FROM machine_readings WHERE id = :id", { id: readingId });
  if (rows.length === 0) return null;
  return readingToFeatureDict(rows[0]);
}

router.post("/compare/:readingId", async (req, res) => {
  try {
    const originalReading = await getReadingFeatureDict(req.params.readingId);
    if (!originalReading) return res.status(404).json({ error: "Reading not found." });

    const data = await callMlService("post", "/whatif/compare", {
      original_reading: originalReading,
      overrides: req.body.overrides || {},
    });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "What-if comparison failed." });
  }
});

router.post("/search/:readingId", async (req, res) => {
  try {
    const originalReading = await getReadingFeatureDict(req.params.readingId);
    if (!originalReading) return res.status(404).json({ error: "Reading not found." });

    const data = await callMlService("post", "/whatif/search", {
      original_reading: originalReading,
      target_probability: req.body.target_probability,
    });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "What-if search failed." });
  }
});

export default router;
