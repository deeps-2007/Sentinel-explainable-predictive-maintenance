import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { api } from "../api/client.js";
import { SectionTitle, Alert, Spinner } from "../components/Atoms.jsx";

export default function ShapExplanation() {
  const [tab, setTab] = useState("global");
  const [readings, setReadings] = useState([]);
  const [readingId, setReadingId] = useState(null);
  const [globalImportance, setGlobalImportance] = useState(null);
  const [localShap, setLocalShap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get("/predictions/readings")
      .then(({ data }) => {
        setReadings(data.readings);
        const scored = data.readings.find((r) => r.prediction_id);
        if (scored) setReadingId(scored.reading_id);
      })
      .catch((err) => setError(err?.response?.data?.error || "Could not load readings."))
      .finally(() => setLoading(false));

    api.get("/shap/global").then(({ data }) => setGlobalImportance(data.importance)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!readingId) return;
    setLocalLoading(true);
    api
      .get(`/shap/reading/${readingId}`)
      .then(({ data }) => setLocalShap(data))
      .catch(() => setLocalShap(null))
      .finally(() => setLocalLoading(false));
  }, [readingId]);

  const topIncreasing = useMemo(
    () => (localShap?.shap_values || []).filter((r) => r.contribution_direction === "increases_risk").slice(0, 5),
    [localShap]
  );
  const topDecreasing = useMemo(
    () => (localShap?.shap_values || []).filter((r) => r.contribution_direction === "decreases_risk").slice(0, 5),
    [localShap]
  );
  const waterfallData = useMemo(
    () => (localShap?.shap_values || []).slice(0, 10).sort((a, b) => a.shap_value - b.shap_value),
    [localShap]
  );

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}><Spinner /></div>;

  return (
    <div>
      <div className="pdm-hero">
        <h1>🧠 SHAP Explainability</h1>
        <p>Understand why the model predicted what it predicted</p>
      </div>

      <Alert type="info">
        <b>SHAP shows how features contribute to the model's prediction; it does not prove physical causation.</b>{" "}
        Use these explanations to guide inspection priorities, not as definitive root-cause diagnoses.
      </Alert>

      <div className="pdm-tabs">
        <button className={`pdm-tab${tab === "global" ? " active" : ""}`} onClick={() => setTab("global")}>
          🌍 Global feature importance
        </button>
        <button className={`pdm-tab${tab === "local" ? " active" : ""}`} onClick={() => setTab("local")}>
          🔬 Local (per-machine) explanation
        </button>
      </div>

      {tab === "global" && (
        <>
          <SectionTitle icon="🌍">Global SHAP feature importance</SectionTitle>
          <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
            Mean absolute SHAP value across a sample of stored readings, for the overall-failure model.
          </p>
          {error && <Alert type="error">{error}</Alert>}
          {globalImportance && globalImportance.length > 0 ? (
            <div className="pdm-card">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={[...globalImportance].sort((a, b) => a.mean_abs_shap - b.mean_abs_shap)} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="feature" type="category" width={160} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="mean_abs_shap" fill="#4f46e5" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Alert type="info">No data available yet. Upload readings and run predictions first.</Alert>
          )}
        </>
      )}

      {tab === "local" && (
        <>
          <SectionTitle icon="🔬">Local explanation for a specific reading</SectionTitle>
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

          {localLoading ? (
            <Spinner />
          ) : localShap ? (
            <>
              <Alert type="info">💬 {localShap.summary}</Alert>

              <SectionTitle icon="🌊">SHAP waterfall (top contributing features)</SectionTitle>
              <div className="pdm-card">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={waterfallData} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="feature" type="category" width={160} fontSize={11} />
                    <Tooltip formatter={(v) => v.toFixed(3)} />
                    <Bar dataKey="shap_value" radius={[0, 6, 6, 0]}>
                      {waterfallData.map((entry, i) => (
                        <Cell key={i} fill={entry.shap_value >= 0 ? "#dc2626" : "#16a34a"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="pdm-grid-2">
                <div>
                  <SectionTitle icon="⬆️">Top risk-increasing features</SectionTitle>
                  <div className="pdm-table-wrap">
                    <table className="pdm-table">
                      <thead><tr><th>Feature</th><th>Value</th><th>SHAP</th></tr></thead>
                      <tbody>
                        {topIncreasing.map((r, i) => (
                          <tr key={i}><td>{r.feature}</td><td>{Number(r.feature_value).toFixed(2)}</td><td>{r.shap_value.toFixed(3)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <SectionTitle icon="⬇️">Top risk-decreasing features</SectionTitle>
                  <div className="pdm-table-wrap">
                    <table className="pdm-table">
                      <thead><tr><th>Feature</th><th>Value</th><th>SHAP</th></tr></thead>
                      <tbody>
                        {topDecreasing.map((r, i) => (
                          <tr key={i}><td>{r.feature}</td><td>{Number(r.feature_value).toFixed(2)}</td><td>{r.shap_value.toFixed(3)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <Alert type="warning">No explanation available for this reading yet.</Alert>
          )}
        </>
      )}
    </div>
  );
}
