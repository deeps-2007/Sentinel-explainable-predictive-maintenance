import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { callMlService } from "../services/mlClient.js";
import { readingToFeatureDict } from "../utils/readingMapper.js";

const router = Router();
router.use(requireAuth);

/** Global SHAP feature importance across a sample of stored readings. */
router.get("/global", async (req, res) => {
  try {
    const [readings] = await pool.query("SELECT * FROM machine_readings LIMIT 2000");
    if (readings.length === 0) {
      return res.json({ importance: [] });
    }
    const featureDicts = readings.map(readingToFeatureDict);
    const data = await callMlService("post", "/explain/global", {
      readings: featureDicts,
      sample_size: 500,
    });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Could not compute global importance." });
  }
});

/** Local SHAP explanation for one specific reading. */
router.get("/reading/:readingId", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM machine_readings WHERE id = :id", {
      id: req.params.readingId,
    });
    if (rows.length === 0) {
      return res.status(404).json({ error: "Reading not found." });
    }
    const featureDict = readingToFeatureDict(rows[0]);
    const data = await callMlService("post", "/explain", { reading: featureDict });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Could not compute explanation." });
  }
});

/** Ad-hoc SHAP explanation for an arbitrary (e.g. what-if scenario) reading. */
router.post("/explain-adhoc", async (req, res) => {
  try {
    const data = await callMlService("post", "/explain", { reading: req.body.reading });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Could not compute explanation." });
  }
});

export default router;
