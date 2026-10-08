import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const ENGINEER = "Maintenance Engineer";
const TECHNICIAN = "Maintenance Technician";
const MANAGER = "Maintenance Manager";

// Statuses a Technician is allowed to move a task to themselves.
const TECHNICIAN_STATUSES = ["Open", "In Progress", "Completed"];

// Fixed SLA: once a Technician marks a task Completed, the Manager has this
// many hours to verify it before it's flagged overdue on their dashboard.
const VERIFICATION_SLA_HOURS = 24;

/** The computed "am I overdue" expression, reused by every SELECT below. */
/** The raw CASE expression, with no alias - safe to embed inside another expression. */
const OVERDUE_CASE_SQL = `
  CASE
    WHEN status IN ('Open', 'In Progress') AND due_at IS NOT NULL AND due_at < NOW() THEN TRUE
    WHEN status = 'Completed' AND verification_due_at IS NOT NULL AND verification_due_at < NOW() THEN TRUE
    ELSE FALSE
  END
`;

/** Same expression, pre-aliased for a top-level SELECT column. */
const IS_OVERDUE_SQL = `${OVERDUE_CASE_SQL} AS is_overdue`;

async function getCurrentBatchId() {
  const [rows] = await pool.query(
    "SELECT id FROM uploaded_files WHERE status = 'processed' ORDER BY upload_date DESC LIMIT 1"
  );
  return rows[0]?.id ?? null;
}

/** Approved recommendations that don't have a task yet (for the Engineer's assign screen). */
router.get("/approved-recommendations", requireRole(ENGINEER), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT rec.id AS recommendation_id, rec.failure_mode, rec.recommendation_text, rec.urgency,
             p.id AS prediction_id, r.machine_id
      FROM recommendations rec
      JOIN predictions p ON rec.prediction_id = p.id
      JOIN machine_readings r ON p.reading_id = r.id
      WHERE rec.recommendation_status = 'Approved'
        AND rec.id NOT IN (
          SELECT recommendation_id FROM maintenance_tasks WHERE recommendation_id IS NOT NULL
        )
      ORDER BY rec.created_at DESC
    `);
    res.json({ recommendations: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load approved recommendations." });
  }
});

/**
 * Create a simulated maintenance task.
 *
 * Only a Maintenance Engineer may do this - their one right in this
 * workflow is to accept (approve) a recommendation and hand it to a
 * technician. `assigned_to` is required and must be the username of an
 * actual registered Maintenance Technician (see GET /api/users/technicians),
 * never free text.
 *
 * `deadline_hours` is optional: when given, the Engineer is setting how long
 * the Technician has to act before the task shows as overdue on their
 * dashboard (due_at = now + deadline_hours).
 */
router.post("/", requireRole(ENGINEER), async (req, res) => {
  const {
    machine_id: machineId,
    prediction_id: predictionId,
    recommendation_id: recommendationId,
    failure_mode: failureMode,
    recommended_action: recommendedAction,
    priority,
    assigned_to: assignedTo,
    deadline_hours: deadlineHoursRaw,
  } = req.body || {};

  if (!machineId || !recommendedAction) {
    return res.status(400).json({ error: "machine_id and recommended_action are required." });
  }
  if (!assignedTo) {
    return res.status(400).json({ error: "A registered technician must be assigned to this task." });
  }

  let deadlineHours = null;
  if (deadlineHoursRaw !== undefined && deadlineHoursRaw !== null && deadlineHoursRaw !== "") {
    deadlineHours = Number(deadlineHoursRaw);
    if (!Number.isFinite(deadlineHours) || deadlineHours <= 0) {
      return res.status(400).json({ error: "deadline_hours must be a positive number of hours." });
    }
  }

  try {
    const [technicians] = await pool.query(
      "SELECT id FROM app_users WHERE username = :username AND role = :role AND is_active = TRUE",
      { username: assignedTo, role: TECHNICIAN }
    );
    if (technicians.length === 0) {
      return res.status(400).json({
        error: `'${assignedTo}' is not a registered, active Maintenance Technician.`,
      });
    }

    const uploadBatchId = await getCurrentBatchId();

    const [result] = await pool.query(
      `INSERT INTO maintenance_tasks
         (machine_id, prediction_id, recommendation_id, failure_mode, recommended_action,
          priority, assigned_to, status, approved_by, deadline_hours, due_at, upload_batch_id)
       VALUES (:machineId, :predictionId, :recommendationId, :failureMode, :recommendedAction,
               :priority, :assignedTo, 'Open', :approvedBy, :deadlineHours,
               ${deadlineHours ? "DATE_ADD(NOW(), INTERVAL :deadlineHours HOUR)" : "NULL"},
               :uploadBatchId)`,
      {
        machineId,
        predictionId: predictionId || null,
        recommendationId: recommendationId || null,
        failureMode: failureMode || null,
        recommendedAction,
        priority: priority || "Medium",
        assignedTo,
        approvedBy: req.user.full_name || req.user.username,
        deadlineHours,
        uploadBatchId,
      }
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create maintenance task." });
  }
});

/**
 * List tasks. Every role can view; `assigned_to` lets a technician (or the
 * frontend, on their behalf) narrow to just their own work. Each row carries
 * a computed `is_overdue` flag so the dashboards can raise an alert without
 * a separate round-trip.
 */
router.get("/", async (req, res) => {
  const statusFilter = req.query.status ? String(req.query.status).split(",") : null;
  const assignedToFilter = req.query.assigned_to ? String(req.query.assigned_to) : null;

  try {
    let sql = `SELECT *, ${IS_OVERDUE_SQL} FROM maintenance_tasks WHERE 1 = 1`;
    const params = {};
    if (statusFilter && statusFilter.length > 0) {
      sql += " AND status IN (:statusFilter)";
      params.statusFilter = statusFilter;
    }
    if (assignedToFilter) {
      sql += " AND assigned_to = :assignedToFilter";
      params.assignedToFilter = assignedToFilter;
    }
    sql += " ORDER BY created_at DESC LIMIT 200";
    const [rows] = await pool.query(sql, params);
    res.json({ tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load maintenance tasks." });
  }
});

/**
 * Lightweight alert feed for the top-of-dashboard banner:
 * - Technician: their own tasks that have blown past the Engineer-set deadline.
 * - Manager: Completed tasks that have sat unverified past the 24h SLA.
 * Any other role gets an empty list (nothing to alert them about here).
 */
router.get("/alerts", async (req, res) => {
  try {
    if (req.user.role === TECHNICIAN) {
      const [rows] = await pool.query(
        `SELECT *, ${IS_OVERDUE_SQL} FROM maintenance_tasks
         WHERE assigned_to = :username
           AND status IN ('Open', 'In Progress')
           AND due_at IS NOT NULL AND due_at < NOW()
         ORDER BY due_at ASC`,
        { username: req.user.username }
      );
      return res.json({ tasks: rows });
    }
    if (req.user.role === MANAGER) {
      const [rows] = await pool.query(
        `SELECT *, ${IS_OVERDUE_SQL} FROM maintenance_tasks
         WHERE status = 'Completed'
           AND verification_due_at IS NOT NULL AND verification_due_at < NOW()
         ORDER BY verification_due_at ASC`
      );
      return res.json({ tasks: rows });
    }
    res.json({ tasks: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load alerts." });
  }
});

/**
 * Tasks sitting at 'Completed', i.e. finished by a technician and waiting
 * for a Maintenance Manager to verify them. Powers the Manager dashboard's
 * dedicated "Completed - awaiting verification" column, including whether
 * each one has breached the 24h verification SLA.
 */
router.get("/awaiting-verification", requireRole(MANAGER), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT *, ${IS_OVERDUE_SQL} FROM maintenance_tasks
       WHERE status = 'Completed' ORDER BY completed_at DESC LIMIT 200`
    );
    res.json({ tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load tasks awaiting verification." });
  }
});

/**
 * Analytical report: "previously done" (historical fleet batches) vs
 * "currently done" (the fleet dataset uploaded most recently). Tasks are
 * never deleted by a CSV replace-upload, so this reads straight off the
 * persistent maintenance_tasks table using upload_batch_id to split the two.
 */
router.get("/analytics", async (req, res) => {
  try {
    const currentBatchId = await getCurrentBatchId();

    const scopeSql = currentBatchId
      ? "CASE WHEN upload_batch_id = :currentBatchId THEN 'current' ELSE 'historical' END"
      : "'historical'";

    const [summary] = await pool.query(
      `SELECT
         ${scopeSql} AS scope,
         COUNT(*) AS total,
         SUM(status = 'Open') AS open_count,
         SUM(status = 'In Progress') AS in_progress_count,
         SUM(status = 'Completed') AS completed_count,
         SUM(status = 'Verified') AS verified_count,
         SUM(is_overdue_flag) AS overdue_count,
         AVG(CASE WHEN completed_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, completed_at) END) AS avg_minutes_to_complete,
         AVG(CASE WHEN status = 'Verified' AND verified_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, completed_at, verified_at) END) AS avg_minutes_to_verify
       FROM (
         SELECT *, (${OVERDUE_CASE_SQL}) AS is_overdue_flag FROM maintenance_tasks
       ) t
       GROUP BY scope`,
      { currentBatchId }
    );

    const [byPriority] = await pool.query(
      `SELECT priority, COUNT(*) AS total FROM maintenance_tasks GROUP BY priority`
    );

    const [byFailureMode] = await pool.query(
      `SELECT COALESCE(failure_mode, 'Unspecified') AS failure_mode, COUNT(*) AS total
       FROM maintenance_tasks GROUP BY failure_mode`
    );

    const [trend] = await pool.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS created,
              SUM(status = 'Verified') AS verified
       FROM maintenance_tasks
       GROUP BY DATE(created_at)
       ORDER BY day ASC
       LIMIT 90`
    );

    res.json({
      current_batch_id: currentBatchId,
      summary,
      by_priority: byPriority,
      by_failure_mode: byFailureMode,
      trend,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not build maintenance analytics." });
  }
});

/**
 * Update a task's status.
 *
 * - Maintenance Technician: may move their own assigned tasks between
 *   Open / In Progress / Completed. Cannot reassign, cannot verify.
 *   Moving to Completed starts the 24h manager-verification SLA.
 * - Maintenance Manager: may only move a task from Completed to Verified
 *   (that is the only action a Manager can take here).
 * - Maintenance Engineer / Operator: no status-update rights on this
 *   endpoint - an Engineer's only right is to create the task (above).
 */
router.patch("/:id", async (req, res) => {
  const { status } = req.body || {};
  if (!status) {
    return res.status(400).json({ error: "status is required." });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM maintenance_tasks WHERE id = :id", {
      id: req.params.id,
    });
    const task = rows[0];
    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    if (req.user.role === TECHNICIAN) {
      if (task.assigned_to !== req.user.username) {
        return res.status(403).json({ error: "You can only update tasks assigned to you." });
      }
      if (!TECHNICIAN_STATUSES.includes(status)) {
        return res.status(403).json({
          error: `Technicians may only set status to one of: ${TECHNICIAN_STATUSES.join(", ")}.`,
        });
      }
    } else if (req.user.role === MANAGER) {
      if (task.status !== "Completed" || status !== "Verified") {
        return res.status(403).json({
          error: "Managers may only move a Completed task to Verified.",
        });
      }
    } else {
      return res.status(403).json({
        error: `This action is only available to ${TECHNICIAN} (work the task) or ${MANAGER} (verify it).`,
      });
    }

    // completed_at is stamped once, when the Technician completes the task,
    // and never overwritten - the Manager's later Verify shouldn't erase the
    // original completion time the 24h SLA and analytics rely on.
    const fields = ["status = :status"];
    const params = { status, id: req.params.id };

    if (status === "Completed") {
      fields.push("completed_at = NOW()");
      fields.push(`verification_due_at = DATE_ADD(NOW(), INTERVAL ${VERIFICATION_SLA_HOURS} HOUR)`);
    } else if (status === "Verified") {
      fields.push("verified_at = NOW()");
    }

    await pool.query(
      `UPDATE maintenance_tasks SET ${fields.join(", ")} WHERE id = :id`,
      params
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update task." });
  }
});

export default router;
