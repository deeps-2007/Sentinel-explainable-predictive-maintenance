import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { api } from "../api/client.js";
import { KpiRow, SectionTitle, Alert, Spinner } from "../components/Atoms.jsx";
import MachineAvatar from "../components/MachineAvatar.jsx";

const STATUS_COLORS = { Healthy: "#16a34a", Warning: "#f59e0b", Critical: "#dc2626" };

export default function FleetOverview() {
  const [summary, setSummary] = useState(null);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get("/fleet/summary"), api.get("/predictions/readings")])
      .then(([summaryRes, readingsRes]) => {
        setSummary(summaryRes.data);
        setReadings(readingsRes.data.readings);
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load fleet data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <Spinner />
      </div>
    );
  }

  if (error) return <Alert type="error">{error}</Alert>;

  if (!summary || summary.total_readings === 0) {
    return (
      <div>
        <div className="pdm-hero">
          <h1>📊 Fleet Overview</h1>
          <p>Fleet-wide health summary at a glance</p>
        </div>
        <Alert type="info">No machine readings found yet. Go to CSV Upload to add data.</Alert>
      </div>
    );
  }

  const pieData = Object.entries(summary.status_counts).map(([status, n]) => ({ name: status, value: n }));
  const scored = readings.filter((r) => r.status && r.status !== "Not scored");

  return (
    <div>
      <div className="pdm-hero">
        <h1>📊 Fleet Overview</h1>
        <p>Fleet-wide health summary at a glance</p>
      </div>

      <KpiRow
        items={[
          { label: "Total readings", value: summary.total_readings.toLocaleString(), icon: "🗂️", color: "#4f46e5" },
          { label: "Healthy", value: summary.status_counts.Healthy, icon: "✅", color: "#16a34a" },
          { label: "Warning", value: summary.status_counts.Warning, icon: "⚠️", color: "#f59e0b" },
          { label: "Critical", value: summary.status_counts.Critical, icon: "🚨", color: "#dc2626" },
          {
            label: "Avg. failure probability",
            value: summary.average_probability != null ? `${(summary.average_probability * 100).toFixed(1)}%` : "N/A",
            icon: "📈",
            color: "#06b6d4",
          },
        ]}
      />

      <SectionTitle icon="🏭">Fleet at a glance (live status)</SectionTitle>
      <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "0.8rem" }}>
        Each machine's animation reflects its own readings — gear speed follows rotational speed, the wear bar
        follows tool wear, and color follows current risk status. Click a machine to inspect it.
      </p>
      <div className="pdm-machine-grid">
        {scored.slice(0, 24).map((r) => (
          <MachineAvatar
            key={r.reading_id}
            machineId={r.machine_id}
            type={r.Type}
            rotationalSpeed={r["Rotational speed [rpm]"]}
            toolWear={r["Tool wear [min]"]}
            torque={r["Torque [Nm]"]}
            status={r.status}
            size="sm"
            onClick={() => navigate("/prediction", { state: { readingId: r.reading_id } })}
          />
        ))}
      </div>

      <div className="pdm-grid-2" style={{ marginTop: "1.6rem" }}>
        <div>
          <SectionTitle icon="🥧">Risk distribution</SectionTitle>
          <div className="pdm-card">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <SectionTitle icon="🔥">Highest-risk machines</SectionTitle>
          <div className="pdm-table-wrap">
            <table className="pdm-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Type</th>
                  <th>Probability</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.top_risk_machines.map((m) => (
                  <tr key={m.machine_id}>
                    <td>{m.machine_id}</td>
                    <td>{m.Type}</td>
                    <td>{(m.failure_probability * 100).toFixed(1)}%</td>
                    <td>
                      <span className="pdm-badge" style={{ backgroundColor: STATUS_COLORS[m.status] }}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="pdm-grid-2" style={{ marginTop: "1.6rem" }}>
        <div>
          <SectionTitle icon="📁">Recent uploaded files</SectionTitle>
          <div className="pdm-table-wrap">
            <table className="pdm-table">
              <thead>
                <tr><th>Filename</th><th>Rows</th><th>Status</th></tr>
              </thead>
              <tbody>
                {summary.recent_files.map((f) => (
                  <tr key={f.id}>
                    <td>{f.filename}</td>
                    <td>{f.valid_row_count}/{f.row_count}</td>
                    <td>{f.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <SectionTitle icon="🧰">Open maintenance tasks</SectionTitle>
          <div className="pdm-table-wrap">
            <table className="pdm-table">
              <thead>
                <tr><th>Machine</th><th>Failure mode</th><th>Status</th></tr>
              </thead>
              <tbody>
                {summary.open_tasks.length === 0 && (
                  <tr><td colSpan={3} style={{ color: "#94a3b8" }}>No open tasks.</td></tr>
                )}
                {summary.open_tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.machine_id}</td>
                    <td>{t.failure_mode}</td>
                    <td>{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
