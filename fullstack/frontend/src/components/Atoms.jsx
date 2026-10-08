export function KpiRow({ items }) {
  return (
    <div className="pdm-kpi-row">
      {items.map((it, i) => (
        <div key={i} className="pdm-kpi" style={{ "--kpi-color": it.color || "#4f46e5" }}>
          <span className="pdm-kpi-icon">{it.icon || "📊"}</span>
          <div className="pdm-kpi-value">{it.value}</div>
          <div className="pdm-kpi-label">{it.label}</div>
          {it.delta && (
            <div className={`pdm-kpi-delta ${it.deltaDirection || "flat"}`}>
              {it.deltaDirection === "up" ? "▲" : it.deltaDirection === "down" ? "▼" : "→"} {it.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function SectionTitle({ icon, children }) {
  return (
    <div className="pdm-section-title">
      <span className="bar" />
      {icon} {children}
    </div>
  );
}

const STATUS_COLORS = { Healthy: "#16a34a", Warning: "#f59e0b", Critical: "#dc2626" };

export function RiskBadge({ status }) {
  const color = STATUS_COLORS[status] || "#64748b";
  return (
    <span className="pdm-badge" style={{ backgroundColor: color }}>
      {status}
    </span>
  );
}

export function PulseDot({ status, label }) {
  const color = STATUS_COLORS[status] || "#64748b";
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span className="pdm-pulse" style={{ backgroundColor: color }} />
      <span style={{ fontWeight: 600, color: "#334155" }}>{label ?? status}</span>
    </span>
  );
}

export function Alert({ type = "info", children }) {
  const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
  return (
    <div className={`pdm-alert ${type}`}>
      <span>{icons[type]}</span>
      <span>{children}</span>
    </div>
  );
}

export function Spinner() {
  return <div className="pdm-spinner" />;
}

export function Card({ children, hover = false, style }) {
  return (
    <div className={`pdm-card${hover ? " hover" : ""}`} style={style}>
      {children}
    </div>
  );
}
