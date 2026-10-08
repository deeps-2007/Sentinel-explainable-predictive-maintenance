import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { api } from "../api/client.js";
import { KpiRow, SectionTitle, RiskBadge, Alert, Spinner } from "../components/Atoms.jsx";
import GaugeChart from "../components/GaugeChart.jsx";
import MachineAvatar from "../components/MachineAvatar.jsx";

const STATUS_COLOR = { Healthy: "#16a34a", Warning: "#f59e0b", Critical: "#dc2626" };

export default function MachinePrediction() {
  const location = useLocation();
  const [readings, setReadings] = useState([]);
  const [readingId, setReadingId] = useState(location.state?.readingId || null);
  const [failureModes, setFailureModes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get("/predictions/readings")
      .then(({ data }) => {
        setReadings(data.readings);
        if (!readingId && data.readings.length > 0) {
          const scored = data.readings.find((r) => r.prediction_id);
          setReadingId((scored || data.readings[0]).reading_id);
        }
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load readings."))
      .finally(() => setLoading(false));
  }, []);

  const row = useMemo(() => readings.find((r) => r.reading_id === readingId), [readings, readingId]);

  useEffect(() => {
    if (row?.prediction_id) {
      api.get(`/predictions/${row.prediction_id}/failure-modes`).then(({ data }) => setFailureModes(data.failure_modes));
    } else {
      setFailureModes([]);
    }
  }, [row?.prediction_id]);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}><Spinner /></div>;
  if (error) return <Alert type="error">{error}</Alert>;
  if (readings.length === 0) return <Alert type="info">No machine readings found. Upload a CSV first.</Alert>;

  return (
    <div>
      <div className="pdm-hero">
        <h1>🔍 Machine Prediction</h1>
        <p>Failure probability and failure-mode breakdown for a reading</p>
      </div>

      <div className="pdm-field" style={{ maxWidth: 480 }}>
        <label>Select a machine reading</label>
        <select className="pdm-select" value={readingId || ""} onChange={(e) => setReadingId(Number(e.target.value))}>
          {readings.map((r) => (
            <option key={r.reading_id} value={r.reading_id}>
              #{r.reading_id} · {r.machine_id} · Type {r.Type} · {r.status || "Not scored"}
            </option>
          ))}
        </select>
      </div>

      {!row?.prediction_id ? (
        <Alert type="warning">This reading has not been scored yet. Run prediction from the CSV Upload page.</Alert>
      ) : (
        <>
          <KpiRow
            items={[
              { label: "Machine ID", value: row.machine_id, icon: "🏭", color: "#4f46e5" },
              { label: "Type", value: row.Type, icon: "🏷️", color: "#06b6d4" },
              { label: "Status", value: row.status, icon: "🩺", color: STATUS_COLOR[row.status] },
              { label: "Model version", value: row.model_version, icon: "🧬", color: "#a855f7" },
            ]}
          />

          <div className="pdm-grid-2">
            <div>
              <SectionTitle icon="🎬">Live machine visual</SectionTitle>
              <div className="pdm-card" style={{ display: "flex", justifyContent: "center", padding: "1.6rem" }}>
                <MachineAvatar
                  machineId={row.machine_id}
                  type={row.Type}
                  rotationalSpeed={row["Rotational speed [rpm]"]}
                  toolWear={row["Tool wear [min]"]}
                  torque={row["Torque [Nm]"]}
                  status={row.status}
                  size="lg"
                  interactive={false}
                />
              </div>

              <SectionTitle icon="🌡️">Current sensor values</SectionTitle>
              <div className="pdm-table-wrap">
                <table className="pdm-table">
                  <tbody>
                    <tr><td>Air temperature [K]</td><td>{row["Air temperature [K]"]}</td></tr>
                    <tr><td>Process temperature [K]</td><td>{row["Process temperature [K]"]}</td></tr>
                    <tr><td>Rotational speed [rpm]</td><td>{row["Rotational speed [rpm]"]}</td></tr>
                    <tr><td>Torque [Nm]</td><td>{row["Torque [Nm]"]}</td></tr>
                    <tr><td>Tool wear [min]</td><td>{row["Tool wear [min]"]}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionTitle icon="🎯">Overall failure probability</SectionTitle>
              <div className="pdm-card">
                <GaugeChart probability={row.failure_probability} />
                <div style={{ textAlign: "center" }}><RiskBadge status={row.status} /></div>
              </div>

              <SectionTitle icon="🧩">Failure-mode probabilities</SectionTitle>
              <div className="pdm-card">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={failureModes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="failure_mode" />
                    <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                    <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                    <Bar dataKey="probability" radius={[6, 6, 0, 0]}>
                      {failureModes.map((entry, i) => (
                        <Cell key={i} fill={entry.probability >= 0.7 ? "#dc2626" : entry.probability >= 0.3 ? "#f59e0b" : "#16a34a"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
