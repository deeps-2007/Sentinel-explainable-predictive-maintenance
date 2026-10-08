import { useEffect, useMemo, useState, useRef } from "react";
import { api, apiErrorMessage } from "../api/client.js";
import { KpiRow, SectionTitle, Alert, Spinner } from "../components/Atoms.jsx";
import GaugeChart from "../components/GaugeChart.jsx";

const RANGES = {
  "Air temperature [K]": [250, 350],
  "Process temperature [K]": [250, 360],
  "Rotational speed [rpm]": [0, 5000],
  "Torque [Nm]": [0, 150],
  "Tool wear [min]": [0, 300],
};
const FIELDS = Object.keys(RANGES);

export default function WhatIfSimulator() {
  const [readings, setReadings] = useState([]);
  const [readingId, setReadingId] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [comparison, setComparison] = useState(null);
  const [scenarioShap, setScenarioShap] = useState(null);
  const [scenarioRecs, setScenarioRecs] = useState([]);
  const [target, setTarget] = useState(0.3);
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    api
      .get("/predictions/readings")
      .then(({ data }) => {
        setReadings(data.readings);
        const scored = data.readings.find((r) => r.prediction_id);
        if (scored) setReadingId(scored.reading_id);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const row = useMemo(() => readings.find((r) => r.reading_id === readingId), [readings, readingId]);

  useEffect(() => {
    if (!row) return;
    const initial = {};
    FIELDS.forEach((f) => { initial[f] = row[f]; });
    setOverrides(initial);
    setSearchResult(null);
  }, [row?.reading_id]);

  useEffect(() => {
    if (!readingId || Object.keys(overrides).length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runComparison(), 350);
    return () => clearTimeout(debounceRef.current);
  }, [overrides, readingId]);

  async function runComparison() {
    try {
      const { data } = await api.post(`/whatif/compare/${readingId}`, { overrides });
      setComparison(data);

      const [shapRes, recRes] = await Promise.all([
        api.post("/shap/explain-adhoc", { reading: data.scenario_reading }),
        api.post("/recommendations/compute", {
          overall_probability: data.scenario_probability,
          failure_mode_probabilities: data.scenario_failure_modes,
        }),
      ]);
      setScenarioShap(shapRes.data);
      setScenarioRecs(recRes.data.recommendations);
    } catch (err) {
      setError(apiErrorMessage(err, "What-if comparison failed."));
    }
  }

  async function handleSearch() {
    setSearching(true);
    setSearchResult(null);
    try {
      const { data } = await api.post(`/whatif/search/${readingId}`, { target_probability: target });
      setSearchResult(data);
    } catch (err) {
      setError(apiErrorMessage(err, "What-if search failed."));
    } finally {
      setSearching(false);
    }
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}><Spinner /></div>;
  if (readings.length === 0) return <Alert type="info">No machine readings found. Upload a CSV first.</Alert>;

  return (
    <div>
      <div className="pdm-hero">
        <h1>🧪 What-If Simulator</h1>
        <p>Test hypothetical sensor changes and search for lower-risk settings</p>
      </div>
      <Alert type="warning"><b>Model-based scenario, not a guaranteed physical outcome.</b></Alert>

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

      {row && (
        <>
          <KpiRow items={[
            { label: "Machine ID", value: row.machine_id, icon: "🏭", color: "#4f46e5" },
            { label: "Type (fixed)", value: row.Type, icon: "🔒", color: "#64748b" },
          ]} />
          <p style={{ color: "#64748b", fontSize: "0.82rem" }}>
            Type, UDI, Product ID, and machine ID cannot be changed by the simulator.
          </p>

          <SectionTitle icon="🎚️">Adjust scenario values</SectionTitle>
          <div className="pdm-grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {FIELDS.map((f) => (
              <div key={f} className="pdm-card">
                <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>{f}</label>
                <input
                  type="range"
                  min={RANGES[f][0]}
                  max={RANGES[f][1]}
                  step={(RANGES[f][1] - RANGES[f][0]) / 200}
                  value={overrides[f] ?? row[f]}
                  onChange={(e) => setOverrides({ ...overrides, [f]: parseFloat(e.target.value) })}
                  style={{ width: "100%" }}
                />
                <div style={{ textAlign: "center", fontWeight: 700 }}>{Number(overrides[f] ?? row[f]).toFixed(1)}</div>
              </div>
            ))}
          </div>

          {error && <Alert type="error">{error}</Alert>}

          {comparison && (
            <>
              <SectionTitle icon="⚖️">Original vs. scenario risk</SectionTitle>
              <div className="pdm-grid-2">
                <div className="pdm-card"><GaugeChart probability={comparison.original_probability} title="Original" /></div>
                <div className="pdm-card"><GaugeChart probability={comparison.scenario_probability} title="Scenario" /></div>
              </div>

              <KpiRow items={[{
                label: "Risk difference",
                value: `${comparison.risk_difference >= 0 ? "+" : ""}${(comparison.risk_difference * 100).toFixed(1)}%`,
                icon: "📐",
                color: comparison.risk_difference > 0 ? "#dc2626" : "#16a34a",
              }]} />

              <SectionTitle icon="🧩">Updated failure-mode probabilities</SectionTitle>
              <div className="pdm-grid-5">
                {Object.entries(comparison.scenario_failure_modes).map(([mode, prob]) => {
                  const origProb = comparison.original_failure_modes[mode] || 0;
                  const diff = prob - origProb;
                  return (
                    <div key={mode} className="pdm-kpi">
                      <div className="pdm-kpi-label">{mode}</div>
                      <div className="pdm-kpi-value" style={{ fontSize: "1.2rem" }}>{(prob * 100).toFixed(1)}%</div>
                      <div className={`pdm-kpi-delta ${diff > 0 ? "up" : diff < 0 ? "down" : ""}`}>
                        {diff >= 0 ? "+" : ""}{(diff * 100).toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>

              {scenarioShap && (
                <>
                  <SectionTitle icon="🧠">Updated SHAP explanation (scenario)</SectionTitle>
                  <Alert type="info">{scenarioShap.summary}</Alert>
                </>
              )}

              <SectionTitle icon="✅">Updated recommendations (scenario)</SectionTitle>
              {scenarioRecs.length > 0 ? (
                scenarioRecs.map((rec, i) => (
                  <div className="pdm-card" key={i} style={{ marginBottom: "0.6rem" }}>
                    <b>{rec.failure_mode_label}</b> — {(rec.probability * 100).toFixed(1)}% probability · confidence: <b>{rec.confidence}</b> · urgency: <b>{rec.urgency}</b>
                    <ul style={{ margin: "6px 0 0 1.1rem" }}>
                      {rec.recommended_actions.map((a, j) => <li key={j}>{a}</li>)}
                    </ul>
                  </div>
                ))
              ) : (
                <Alert type="success">✨ No maintenance actions recommended for this scenario.</Alert>
              )}
            </>
          )}

          <SectionTitle icon="🔎">Find Lower-Risk Scenario</SectionTitle>
          <div className="pdm-field" style={{ maxWidth: 400 }}>
            <label>Target failure probability threshold: {(target * 100).toFixed(0)}%</label>
            <input type="range" min="0" max="1" step="0.05" value={target} onChange={(e) => setTarget(parseFloat(e.target.value))} style={{ width: "100%" }} />
          </div>
          <button className="pdm-btn" disabled={searching} onClick={handleSearch}>
            {searching ? <Spinner /> : "🔍 Search for a lower-risk scenario"}
          </button>

          {searchResult && (
            <div style={{ marginTop: "1rem" }}>
              {searchResult.found ? (
                <>
                  <Alert type="success">
                    Found a scenario with failure probability {(searchResult.scenario_probability * 100).toFixed(1)}% (target: {(target * 100).toFixed(0)}%).
                  </Alert>
                  <div className="pdm-card" style={{ maxWidth: 360 }}>
                    <GaugeChart probability={searchResult.scenario_probability} title="Found scenario" />
                  </div>
                  <div className="pdm-table-wrap" style={{ marginTop: "0.6rem" }}>
                    <table className="pdm-table">
                      <tbody>
                        {Object.entries(searchResult.scenario_reading).map(([k, v]) => (
                          <tr key={k}><td>{k}</td><td>{typeof v === "number" ? v.toFixed(2) : v}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ color: "#64748b", fontSize: "0.8rem", marginTop: 6 }}>
                    <b>Model-based scenario, not a guaranteed physical outcome.</b>
                  </p>
                </>
              ) : (
                <Alert type="error">No nearby, physically valid scenario reduced risk below the target within the search space.</Alert>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
