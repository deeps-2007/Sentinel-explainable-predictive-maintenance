import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { KpiRow, SectionTitle, Alert, Spinner, PulseDot } from "../components/Atoms.jsx";

const URGENCY_COLORS = { Critical: "#dc2626", High: "#ea580c", Medium: "#f59e0b", Low: "#16a34a" };

export default function Recommendations() {
  const { user } = useAuth();
  const canApprove = user?.role === "Maintenance Engineer";
  const [statusFilter, setStatusFilter] = useState(["Pending"]);
  const [machineSearch, setMachineSearch] = useState("");
  const [recs, setRecs] = useState([]);
  const [counts, setCounts] = useState({ Pending: 0, Approved: 0, Rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { load(); }, [statusFilter, machineSearch]);

  function load() {
    setLoading(true);
    api
      .get("/recommendations", { params: { status: statusFilter.join(","), machine_id: machineSearch || undefined } })
      .then(({ data }) => { setRecs(data.recommendations); setCounts(data.counts); })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  async function updateStatus(id, status) {
    try {
      await api.patch(`/recommendations/${id}/status`, { status });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function toggleFilter(status) {
    setStatusFilter((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  }

  return (
    <div>
      <div className="pdm-hero">
        <h1>✅ Recommendations</h1>
        <p>Ranked, explainable maintenance recommendations for every machine</p>
      </div>

      <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
        Ranked by failure risk, failure-mode confidence, SHAP evidence, and urgency.{" "}
        {canApprove
          ? <>Approving a recommendation creates a <b>simulated</b> maintenance task — it never controls or stops a real machine.</>
          : "Only a Maintenance Engineer can approve or reject a recommendation."}
      </p>

      <div className="pdm-grid-2" style={{ marginBottom: "1rem", alignItems: "end" }}>
        <div className="pdm-field" style={{ marginBottom: 0 }}>
          <label>Filter by status</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["Pending", "Approved", "Rejected"].map((s) => (
              <button
                key={s}
                className={`pdm-btn sm ${statusFilter.includes(s) ? "" : "secondary"}`}
                onClick={() => toggleFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="pdm-field" style={{ marginBottom: 0 }}>
          <label>Filter by machine ID (optional)</label>
          <input className="pdm-input" placeholder="e.g. M14860" value={machineSearch} onChange={(e) => setMachineSearch(e.target.value)} />
        </div>
      </div>

      <KpiRow items={[
        { label: "Pending", value: counts.Pending, icon: "🕓", color: "#f59e0b" },
        { label: "Approved", value: counts.Approved, icon: "✅", color: "#16a34a" },
        { label: "Rejected", value: counts.Rejected, icon: "❌", color: "#64748b" },
      ]} />

      {error && <Alert type="error">{error}</Alert>}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><Spinner /></div>
      ) : recs.length === 0 ? (
        <Alert type="info">No recommendations match the selected filters.</Alert>
      ) : (
        <>
          <p style={{ color: "#64748b", fontSize: "0.82rem" }}>
            Showing {recs.length} recommendation(s) across {new Set(recs.map((r) => r.machine_id)).size} machine(s).
          </p>
          {recs.map((r) => {
            let features = [];
            try { features = JSON.parse(r.supporting_features || "[]"); } catch { /* ignore */ }
            return (
              <div key={r.recommendation_id} className="pdm-card" style={{ marginBottom: "0.9rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <span style={{ background: "#eef2ff", color: "#1e3a8a", padding: "3px 10px", borderRadius: 8, fontWeight: 700, fontSize: "0.85rem" }}>
                      🏭 Machine ID: {r.machine_id}
                    </span>{" "}
                    <span style={{ color: "#64748b", fontSize: "0.85rem" }}>Type {r.machine_type} · Reading #{r.reading_id}</span>
                    <h3 style={{ marginTop: 8 }}>{r.failure_mode} — {r.recommendation_text}</h3>
                    <p>
                      Overall risk: <b>{(r.overall_probability * 100).toFixed(1)}%</b> · Urgency:{" "}
                      <span style={{ color: URGENCY_COLORS[r.urgency], fontWeight: 700 }}>{r.urgency}</span> · Confidence: <b>{r.confidence}</b>
                    </p>
                    {features.length > 0 && (
                      <p style={{ color: "#64748b", fontSize: "0.8rem" }}>Supporting SHAP features: {features.join(", ")}</p>
                    )}
                    <PulseDot status={r.status} />
                  </div>
                  <div>
                    <div style={{ marginBottom: 8 }}>Status: <b>{r.recommendation_status}</b></div>
                    {r.recommendation_status === "Pending" && canApprove && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="pdm-btn success sm" onClick={() => updateStatus(r.recommendation_id, "Approved")}>✅ Approve</button>
                        <button className="pdm-btn danger sm" onClick={() => updateStatus(r.recommendation_id, "Rejected")}>❌ Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
