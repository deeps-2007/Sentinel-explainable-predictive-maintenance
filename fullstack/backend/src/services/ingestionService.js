import { pool } from "../config/db.js";

/**
 * Delete all existing machine readings, predictions, SHAP explanations, and
 * recommendations so the dashboard reflects only the next upload.
 *
 * Maintenance tasks and user feedback are intentionally preserved (they are
 * human-approved work-order history, not raw sensor data) - their links to
 * the soon-to-be-cleared prediction/recommendation rows are simply nulled.
 *
 * Mirrors src/data_ingestion.py:clear_existing_fleet_data from the original
 * Python implementation.
 */
export async function clearExistingFleetData(conn) {
  await conn.query("UPDATE maintenance_tasks SET prediction_id = NULL, recommendation_id = NULL");
  await conn.query("UPDATE user_feedback SET prediction_id = NULL");

  await conn.query("DELETE FROM shap_explanations");
  await conn.query("DELETE FROM failure_mode_predictions");
  await conn.query("DELETE FROM recommendations");
  await conn.query("DELETE FROM predictions");
  await conn.query("DELETE FROM machine_readings");
}

export async function getUploadHistory(limit = 50) {
  const [rows] = await pool.query(
    "SELECT * FROM uploaded_files ORDER BY upload_date DESC LIMIT :limit",
    { limit }
  );
  return rows;
}
