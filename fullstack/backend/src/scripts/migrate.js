import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const schemaPath = path.join(__dirname, "..", "..", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");

  // mysql2 can run multiple statements if multipleStatements is enabled on
  // a dedicated connection (the shared pool intentionally disables it).
  const mysql = await import("mysql2/promise");
  const { config } = await import("../config/env.js");
  const conn = await mysql.default.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log("✅ Database tables created/verified successfully.");
  } finally {
    await conn.end();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
