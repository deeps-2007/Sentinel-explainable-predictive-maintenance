import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

/**
 * Registered Maintenance Technicians, for the "assign to" dropdown on task
 * creation. Only accounts that actually signed up with that role show up -
 * a Maintenance Engineer can't type an arbitrary name, only pick a real
 * registered technician.
 */
router.get("/technicians", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, full_name, email
       FROM app_users
       WHERE role = 'Maintenance Technician' AND is_active = TRUE
       ORDER BY COALESCE(full_name, username)`
    );
    res.json({ technicians: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load registered technicians." });
  }
});

export default router;
