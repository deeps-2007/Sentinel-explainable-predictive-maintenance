import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api/client.js";
import { PulseDot } from "./Atoms.jsx";

const ROLE_ICONS = {
  "Maintenance Engineer": "🧑‍🔧",
  "Maintenance Technician": "🛠️",
  "Maintenance Manager": "📋",
  Operator: "🎛️",
};

const NAV_ITEMS = [
  { to: "/", icon: "🏠", label: "Home", end: true },
  { to: "/fleet", icon: "📊", label: "Fleet Overview" },
  { to: "/upload", icon: "📤", label: "CSV Upload" },
  { to: "/prediction", icon: "🔍", label: "Machine Prediction" },
  { to: "/shap", icon: "🧠", label: "SHAP Explanation" },
  { to: "/whatif", icon: "🧪", label: "What-If Simulator" },
  { to: "/recommendations", icon: "✅", label: "Recommendations" },
  { to: "/tasks", icon: "🧰", label: "Maintenance Tasks" },
  { to: "/analytics", icon: "📈", label: "Maintenance Analytics" },
  { to: "/monitoring", icon: "📊", label: "Model Monitoring" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dbStatus, setDbStatus] = useState(null);

  useEffect(() => {
    api
      .get("/health")
      .then(({ data }) => setDbStatus(data.database?.ok ? "Healthy" : "Critical"))
      .catch(() => setDbStatus("Critical"));
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="pdm-app-shell">
      <aside className="pdm-sidebar">
        <div className="pdm-sidebar-brand">🛠️ PdM Control Center</div>

        {user && (
          <div style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
            <div style={{ color: "#a7f3d0", fontWeight: 700 }}>
              Signed in as {user.username}
            </div>
            <div style={{ marginTop: 4 }}>
              {ROLE_ICONS[user.role] || "👤"} {user.role}
            </div>
          </div>
        )}

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: "1rem" }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `pdm-nav-link${isActive ? " active" : ""}`}
            >
              <span>{item.icon}</span> {item.label}
            </NavLink>
          ))}
        </nav>

        {user && (
          <button className="pdm-btn secondary sm" onClick={handleLogout}>
            🚪 Log out
          </button>
        )}

        <div className="pdm-sidebar-footer">
          {dbStatus && (
            <div style={{ marginBottom: 8 }}>
              <PulseDot status={dbStatus} label={`MySQL: ${dbStatus === "Healthy" ? "Connected" : "Not connected"}`} />
            </div>
          )}
          <div>Model version: v1.0.0</div>
          <div style={{ marginTop: 8, lineHeight: 1.4 }}>
            ⚠️ Decision-support &amp; simulation only. Never controls a real machine.
          </div>
        </div>
      </aside>

      <main className="pdm-main">{children}</main>
    </div>
  );
}
