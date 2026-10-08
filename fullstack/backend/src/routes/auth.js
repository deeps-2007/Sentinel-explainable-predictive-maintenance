import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";
import { signToken } from "../middleware/auth.js";

export const ROLES = [
  "Maintenance Engineer",
  "Maintenance Technician",
  "Maintenance Manager",
  "Operator",
];

const router = Router();

router.get("/roles", (req, res) => {
  res.json({ roles: ROLES });
});

router.post("/signup", async (req, res) => {
  const { username, email, password, role, full_name: fullName } = req.body || {};

  if (!username?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Username, email, and password are all required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: "Please select a valid role." });
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  try {
    const [existing] = await pool.query(
      "SELECT id FROM app_users WHERE username = :username OR email = :email",
      { username: cleanUsername, email: cleanEmail }
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "That username or email is already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.query(
      `INSERT INTO app_users (username, email, full_name, password_hash, role)
       VALUES (:username, :email, :fullName, :passwordHash, :role)`,
      { username: cleanUsername, email: cleanEmail, fullName: fullName || null, passwordHash, role }
    );

    return res.status(201).json({
      message: "Account created successfully. You can now log in.",
      user_id: result.insertId,
      username: cleanUsername,
      role,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Could not create account. Please try again." });
  }
});

router.post("/login", async (req, res) => {
  const { identifier, password } = req.body || {};

  if (!identifier?.trim() || !password) {
    return res.status(400).json({ error: "Please enter your username/email and password." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM app_users WHERE username = :id OR email = :idLower LIMIT 1",
      { id: identifier.trim(), idLower: identifier.trim().toLowerCase() }
    );
    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid credentials or inactive account." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    await pool.query("UPDATE app_users SET last_login = NOW() WHERE id = :id", { id: user.id });

    const userPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      email: user.email,
    };
    const token = signToken(userPayload);

    return res.json({ message: "Login successful.", token, user: userPayload });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

export default router;
