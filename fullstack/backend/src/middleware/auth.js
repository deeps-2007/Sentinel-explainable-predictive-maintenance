import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/** Express middleware: requires a valid Bearer JWT, attaches req.user. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }
}

/**
 * Express middleware: requires req.user.role to be one of `roles`.
 * Must run after requireAuth. Used to enforce the three-role workflow:
 * Maintenance Engineer approves + assigns, Maintenance Technician works the
 * task (Open/In Progress/Completed), Maintenance Manager verifies completed
 * work (Completed -> Verified).
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `This action is only available to: ${roles.join(", ")}.`,
      });
    }
    next();
  };
}
