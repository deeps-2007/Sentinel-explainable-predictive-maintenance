import mysql from "mysql2/promise";
import { config } from "./env.js";

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  namedPlaceholders: true,
});

export async function checkConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.query("SELECT 1");
    conn.release();
    return { ok: true, message: "Connected to MySQL successfully." };
  } catch (err) {
    return { ok: false, message: `Database connection failed: ${err.message}` };
  }
}
