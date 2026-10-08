import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { callMlService } from "../services/mlClient.js";
import { clearExistingFleetData, getUploadHistory } from "../services/ingestionService.js";
import { resolveMachineId } from "../utils/machineId.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ENGINEER = "Maintenance Engineer";
const MANAGER = "Maintenance Manager";

router.use(requireAuth);

// Anyone authenticated (including a Maintenance Technician) may view the
// upload history - they can see predictions and uploaded datasets read-only.
router.get("/history", async (req, res) => {
  try {
    const rows = await getUploadHistory();
    res.json({ files: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load upload history." });
  }
});

// Only a Maintenance Manager or Maintenance Engineer may ingest a new
// dataset. A Maintenance Technician is read-only here: they can view
// predictions and the uploaded-dataset history but cannot upload.
router.post("/", requireRole(ENGINEER, MANAGER), upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file was uploaded." });
  }

  const isSimulated = req.body.is_simulated === "true" || req.body.is_simulated === true;
  const replaceExisting = req.body.replace_existing !== "false" && req.body.replace_existing !== false;

  let rows;
  try {
    rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return res.status(400).json({ error: `Could not read CSV: ${err.message}` });
  }

  if (rows.length === 0) {
    return res.status(400).json({ error: "The uploaded CSV has no data rows." });
  }

  // Single source of truth for validation rules lives in the ML service
  // (reuses the original Python src/validation.py logic unchanged).
  let validation;
  try {
    validation = await callMlService("post", "/validate", { rows });
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (replaceExisting) {
      await clearExistingFleetData(conn);
    }

    const [fileResult] = await conn.query(
      `INSERT INTO uploaded_files
         (filename, row_count, valid_row_count, duplicate_row_count, invalid_row_count, status, is_simulated)
       VALUES (:filename, :rowCount, :validRowCount, :duplicateRowCount, :invalidRowCount, :status, :isSimulated)`,
      {
        filename: req.file.originalname,
        rowCount: validation.total_rows,
        validRowCount: validation.valid_rows,
        duplicateRowCount: validation.duplicate_rows,
        invalidRowCount: validation.invalid_rows,
        status: validation.is_valid_file ? "processed" : "failed",
        isSimulated,
      }
    );
    const uploadedFileId = fileResult.insertId;

    if (validation.is_valid_file && validation.valid_records.length > 0) {
      let position = 0;
      for (const row of validation.valid_records) {
        position += 1;
        const machineId = resolveMachineId(row, position);
        await conn.query(
          `INSERT INTO machine_readings
             (machine_id, UDI, Product_ID, machine_type, air_temperature, process_temperature,
              rotational_speed, torque, tool_wear, reading_timestamp, source_filename,
              uploaded_file_id, is_simulated)
           VALUES
             (:machineId, :udi, :productId, :machineType, :airTemp, :processTemp,
              :rotSpeed, :torque, :toolWear, :readingTimestamp, :sourceFilename,
              :uploadedFileId, :isSimulated)`,
          {
            machineId,
            udi: row.UDI ?? null,
            productId: row["Product ID"] ?? null,
            machineType: String(row.Type).toUpperCase(),
            airTemp: row["Air temperature [K]"],
            processTemp: row["Process temperature [K]"],
            rotSpeed: row["Rotational speed [rpm]"],
            torque: row["Torque [Nm]"],
            toolWear: row["Tool wear [min]"],
            readingTimestamp: row.timestamp || new Date(),
            sourceFilename: req.file.originalname,
            uploadedFileId,
            isSimulated,
          }
        );
      }
    }

    await conn.commit();

    return res.status(201).json({
      uploaded_file_id: uploadedFileId,
      total_rows: validation.total_rows,
      valid_rows: validation.valid_rows,
      duplicate_rows: validation.duplicate_rows,
      invalid_rows: validation.invalid_rows,
      errors: validation.errors,
      is_valid_file: validation.is_valid_file,
      invalid_records: validation.invalid_records,
      replace_existing: replaceExisting,
    });
  } catch (err) {
    await conn.rollback();
    console.error("Ingestion error:", err);
    return res.status(500).json({ error: `Ingestion failed: ${err.message}` });
  } finally {
    conn.release();
  }
});

export default router;
