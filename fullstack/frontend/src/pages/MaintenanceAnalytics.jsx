import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { api, apiErrorMessage } from "../api/client.js";
import { KpiRow, SectionTitle, Alert, Spinner } from "../components/Atoms.jsx";

const SCOPE_COLOR = { current: "#4f46e5", historical: "#94a3b8" };
const PRIORITY_COLOR = { Low: "#16a34a", Medium: "#f59e0b", High: "#ea580c", Critical: "#dc2626" };
const PIE_COLORS = ["#4f46e5", "#06b6d4", "#16a34a", "#f59e0b", "#dc2626", "#94a3b8"];

function fmtHours(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  const hrs = minutes / 60;
  return hrs < 1 ? `${Math.round(minutes)} min` : `${hrs.toFixed(1)} h`;
}

export default function MaintenanceAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/tasks/analytics")
      .then(({ data }) => setData(data))
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const current = useMemo(() => data?.summary?.find((s) => s.scope === "current"), [data]);
  const historical = useMemo(() => data?.summary?.find((s) => s.scope === "historical"), [data]);

  const totalTasks = (current?.total || 0) + (historical?.total || 0);
  const totalVerified = (Number(current?.verified_count) || 0) + (Number(historical?.verified_count) || 0);
  const totalOverdue = (Number(current?.overdue_count) || 0) + (Number(historical?.overdue_count) || 0);

  const scopeBarData = [
    { scope: "Currently done (latest fleet)", total: current?.total || 0, verified: Number(current?.verified_count) || 0 },
    { scope: "Previously done (historical)", total: historical?.total || 0, verified: Number(historical?.verified_count) || 0 },
  ];

  const priorityPieData = (data?.by_priority || []).map((p) => ({ name: p.priority, value: p.total }));
  const failurePieData = (data?.by_failure_mode || []).map((f) => ({ name: f.failure_mode, value: f.total }));
  const trendData = (data?.trend || []).map((t) => ({
    day: new Date(t.day).toLocaleDateString(),
    created: t.created,
    verified: t.verified,
  }));

  return (
    <div>
      <div className="pdm-hero">
        <h1>📈 Maintenance Analytics</h1>
        <p>How maintenance actually gets done — previously vs. currently, across the whole fleet history</p>
      </div>

      <Alert type="info">
        💡 Maintenance tasks are never deleted when a new CSV replaces the fleet's readings - this
        report reads that full history. <b>Currently done</b> is work tied to the most recently
        uploaded dataset; <b>previously done</b> is everything from earlier uploads.
      </Alert>

      {error && <Alert type="error">{error}</Alert>}

      {loading ? (
        <Spinner />
      ) : !data || totalTasks === 0 ? (
        <Alert type="warning">No maintenance tasks have been recorded yet.</Alert>
      ) : (
        <>
          <KpiRow items={[
            { label: "Total tasks (all time)", value: totalTasks, icon: "🧰", color: "#4f46e5" },
            { label: "Currently done", value: current?.total || 0, icon: "🟣", color: SCOPE_COLOR.current },
            { label: "Previously done", value: historical?.total || 0, icon: "⚪", color: SCOPE_COLOR.historical },
            { label: "Verified (all time)", value: totalVerified, icon: "🔒", color: "#06b6d4" },
            { label: "Overdue right now", value: totalOverdue, icon: "⏰", color: "#dc2626" },
          ]} />

          <SectionTitle icon="⏱️">Average turnaround</SectionTitle>
          <div className="pdm-grid-2" style={{ marginBottom: "1.4rem" }}>
            <div className="pdm-card">
              <b>Currently done</b>
              <p style={{ fontSize: "0.85rem", color: "#475569" }}>
                Avg. time to complete: <b>{fmtHours(current?.avg_minutes_to_complete)}</b><br />
                Avg. time to verify: <b>{fmtHours(current?.avg_minutes_to_verify)}</b>
              </p>
            </div>
            <div className="pdm-card">
              <b>Previously done</b>
              <p style={{ fontSize: "0.85rem", color: "#475569" }}>
                Avg. time to complete: <b>{fmtHours(historical?.avg_minutes_to_complete)}</b><br />
                Avg. time to verify: <b>{fmtHours(historical?.avg_minutes_to_verify)}</b>
              </p>
            </div>
          </div>

          <SectionTitle icon="📊">Currently done vs. previously done</SectionTitle>
          <div className="pdm-card" style={{ height: 300, marginBottom: "1.4rem" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scopeBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="scope" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total tasks" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                <Bar dataKey="verified" name="Verified" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pdm-grid-2" style={{ marginBottom: "1.4rem" }}>
            <div>
              <SectionTitle icon="🚦">By priority</SectionTitle>
              <div className="pdm-card" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={priorityPieData} dataKey="value" nameKey="name" outerRadius={85} label>
                      {priorityPieData.map((p, i) => (
                        <Cell key={p.name} fill={PRIORITY_COLOR[p.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <SectionTitle icon="🧩">By failure mode</SectionTitle>
              <div className="pdm-card" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={failurePieData} dataKey="value" nameKey="name" outerRadius={85} label>
                      {failurePieData.map((f, i) => (
                        <Cell key={f.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <SectionTitle icon="📅">Tasks created vs. verified over time</SectionTitle>
          <div className="pdm-card" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" name="Created" stroke="#4f46e5" strokeWidth={2} />
                <Line type="monotone" dataKey="verified" name="Verified" stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
