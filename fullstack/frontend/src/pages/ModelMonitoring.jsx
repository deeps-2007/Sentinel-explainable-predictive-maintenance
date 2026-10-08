import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { api, apiErrorMessage } from "../api/client.js";
import { KpiRow, SectionTitle, Alert, Spinner } from "../components/Atoms.jsx";

const STATUS_COLOR = { Healthy: "#16a34a", Warning: "#f59e0b", Critical: "#dc2626" };

export default function ModelMonitoring() {
  const [metrics, setMetrics] = useState(null);
  const [modelVersion, setModelVersion] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [target, setTarget] = useState(null);
  const [algo, setAlgo] = useState("xgboost");
  const [featureChoice, setFeatureChoice] = useState("Air temperature [K]");
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [fbActualMode, setFbActualMode] = useState("None");
  const [fbAction, setFbAction] = useState("");
  const [fbUseful, setFbUseful] = useState("Yes");
  const [fbText, setFbText] = useState("");
  const [fbTaskId, setFbTaskId] = useState(null);
  const [fbMsg, setFbMsg] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/monitoring/training-metrics"),
      api.get("/monitoring/model-version"),
      api.get("/monitoring/predictions"),
      api.get("/monitoring/feedback"),
      api.get("/monitoring/completed-tasks"),
      api.get("/predictions/readings"),
    ])
      .then(([m, v, p, f, c, r]) => {
        setMetrics(m.data);
        setModelVersion(v.data.model_version);
        setPredictions(p.data.predictions);
        setFeedback(f.data.feedback);
        setCompletedTasks(c.data.tasks);
        setReadings(r.data.readings);
        if (m.data?.metrics) setTarget(Object.keys(m.data.metrics)[0]);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const m = target && metrics?.metrics?.[target]?.[algo];

  const historyData = useMemo(
    () => [...predictions].sort((a, b) => new Date(a.prediction_timestamp) - new Date(b.prediction_timestamp))
      .map((p) => ({ ts: new Date(p.prediction_timestamp).toLocaleDateString(), prob: p.failure_probability, status: p.status })),
    [predictions]
  );

  const statusDist = useMemo(() => {
    const counts = { Healthy: 0, Warning: 0, Critical: 0 };
    predictions.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return Object.entries(counts).map(([status, n]) => ({ status, n }));
  }, [predictions]);

  const featureHistogram = useMemo(() => {
    const values = readings.map((r) => r[featureChoice]).filter((v) => v != null);
    if (values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const bins = 20;
    const width = (max - min) / bins || 1;
    const buckets = Array.from({ length: bins }, (_, i) => ({ bucket: (min + i * width).toFixed(0), count: 0 }));
    values.forEach((v) => {
      const idx = Math.min(bins - 1, Math.floor((v - min) / width));
      buckets[idx].count += 1;
    });
    return buckets;
  }, [readings, featureChoice]);

  async function submitFeedback() {
    const task = completedTasks.find((t) => t.id === fbTaskId);
    if (!task) return;
    try {
      await api.post("/monitoring/feedback", {
        prediction_id: task.prediction_id,
        maintenance_task_id: task.id,
        actual_failure_mode: fbActualMode === "None" ? null : fbActualMode,
        action_performed: fbAction || null,
        recommendation_was_useful: fbUseful === "Yes",
        feedback_text: fbText || null,
      });
      setFbMsg({ type: "success", text: "Feedback submitted." });
      api.get("/monitoring/feedback").then(({ data }) => setFeedback(data.feedback));
    } catch (err) {
      setFbMsg({ type: "error", text: apiErrorMessage(err) });
    }
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}><Spinner /></div>;

  const scored = predictions.length;
  const avgProb = scored > 0 ? predictions.reduce((s, p) => s + p.failure_probability, 0) / scored : null;

  return (
    <div>
      <div className="pdm-hero">
        <h1>📈 Model Monitoring</h1>
        <p>Model performance, prediction history, and feedback</p>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {metrics?.metrics ? (
        <>
          <SectionTitle icon="🏋️">Latest training run</SectionTitle>
          <p style={{ fontSize: "0.85rem" }}>
            <b>Model version:</b> {metrics.model_version} &nbsp;|&nbsp; <b>Trained at:</b> {metrics.trained_at} &nbsp;|&nbsp; <b>Rows:</b> {metrics.n_rows}
          </p>

          <div className="pdm-grid-2" style={{ maxWidth: 600 }}>
            <div className="pdm-field">
              <label>Target</label>
              <select className="pdm-select" value={target || ""} onChange={(e) => setTarget(e.target.value)}>
                {Object.keys(metrics.metrics).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="pdm-field">
              <label>Algorithm</label>
              <select className="pdm-select" value={algo} onChange={(e) => setAlgo(e.target.value)}>
                <option value="xgboost">XGBoost</option>
                <option value="logistic_regression">Logistic Regression</option>
              </select>
            </div>
          </div>

          {m && (
            <>
              <KpiRow items={[
                { label: "Accuracy", value: m.accuracy.toFixed(3), icon: "🎯", color: "#4f46e5" },
                { label: "Precision", value: m.precision.toFixed(3), icon: "🧭", color: "#06b6d4" },
                { label: "Recall", value: m.recall.toFixed(3), icon: "🔎", color: "#a855f7" },
                { label: "F1-score", value: m.f1_score.toFixed(3), icon: "⚖️", color: "#f59e0b" },
                { label: "ROC-AUC", value: m.roc_auc != null ? m.roc_auc.toFixed(3) : "N/A", icon: "📈", color: "#16a34a" },
                { label: "PR-AUC", value: m.pr_auc != null ? m.pr_auc.toFixed(3) : "N/A", icon: "📉", color: "#dc2626" },
              ]} />

              <SectionTitle icon="🔢">Confusion matrix</SectionTitle>
              <div className="pdm-table-wrap" style={{ maxWidth: 420 }}>
                <table className="pdm-table">
                  <thead><tr><th></th><th>Pred: No failure</th><th>Pred: Failure</th></tr></thead>
                  <tbody>
                    <tr><td><b>Actual: No failure</b></td><td>{m.confusion_matrix[0][0]}</td><td>{m.confusion_matrix[0][1]}</td></tr>
                    <tr><td><b>Actual: Failure</b></td><td>{m.confusion_matrix[1][0]}</td><td>{m.confusion_matrix[1][1]}</td></tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <Alert type="warning">No training metrics found.</Alert>
      )}

      <SectionTitle icon="📡">Prediction activity</SectionTitle>
      <KpiRow items={[
        { label: "Model version (serving)", value: modelVersion || "N/A", icon: "🧬", color: "#a855f7" },
        { label: "Number of predictions", value: scored.toLocaleString(), icon: "🔢", color: "#4f46e5" },
        { label: "Average failure probability", value: avgProb != null ? `${(avgProb * 100).toFixed(1)}%` : "N/A", icon: "📈", color: "#06b6d4" },
      ]} />

      {scored > 0 && (
        <>
          <SectionTitle icon="🕰️">Prediction history</SectionTitle>
          <div className="pdm-card">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={historyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ts" fontSize={11} />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                <Line type="monotone" dataKey="prob" stroke="#4f46e5" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <SectionTitle icon="📊">Failure distribution</SectionTitle>
          <div className="pdm-card">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusDist}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="n" radius={[6, 6, 0, 0]}>
                  {statusDist.map((entry, i) => <Cell key={i} fill={STATUS_COLOR[entry.status]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <SectionTitle icon="📐">Feature distributions</SectionTitle>
          <div className="pdm-field" style={{ maxWidth: 360 }}>
            <label>Feature</label>
            <select className="pdm-select" value={featureChoice} onChange={(e) => setFeatureChoice(e.target.value)}>
              {["Air temperature [K]", "Process temperature [K]", "Rotational speed [rpm]", "Torque [Nm]", "Tool wear [min]"].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="pdm-card">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={featureHistogram}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" fontSize={10} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <SectionTitle icon="💬">Recommendation feedback</SectionTitle>
      {feedback.length > 0 ? (
        <div className="pdm-table-wrap" style={{ marginBottom: "1rem" }}>
          <table className="pdm-table">
            <thead><tr><th>ID</th><th>Actual mode</th><th>Useful?</th><th>Comments</th></tr></thead>
            <tbody>
              {feedback.map((f) => (
                <tr key={f.id}>
                  <td>{f.id}</td><td>{f.actual_failure_mode || "—"}</td>
                  <td>{f.recommendation_was_useful == null ? "—" : f.recommendation_was_useful ? "Yes" : "No"}</td>
                  <td>{f.feedback_text || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Alert type="info">No feedback submitted yet.</Alert>
      )}

      {completedTasks.length > 0 && (
        <div className="pdm-card" style={{ maxWidth: 560 }}>
          <SectionTitle icon="➕">Submit feedback</SectionTitle>
          <div className="pdm-field">
            <label>Completed task</label>
            <select className="pdm-select" value={fbTaskId || ""} onChange={(e) => setFbTaskId(Number(e.target.value))}>
              <option value="">Select…</option>
              {completedTasks.map((t) => <option key={t.id} value={t.id}>#{t.id} · {t.machine_id} · {t.failure_mode}</option>)}
            </select>
          </div>
          <div className="pdm-field">
            <label>Actual failure mode observed</label>
            <select className="pdm-select" value={fbActualMode} onChange={(e) => setFbActualMode(e.target.value)}>
              {["None", "TWF", "HDF", "PWF", "OSF", "RNF"].map((m2) => <option key={m2} value={m2}>{m2}</option>)}
            </select>
          </div>
          <div className="pdm-field">
            <label>Action actually performed</label>
            <textarea className="pdm-input" rows={2} value={fbAction} onChange={(e) => setFbAction(e.target.value)} />
          </div>
          <div className="pdm-field">
            <label>Was the recommendation useful?</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Yes", "No"].map((v) => (
                <button key={v} className={`pdm-btn sm ${fbUseful === v ? "" : "secondary"}`} onClick={() => setFbUseful(v)}>{v}</button>
              ))}
            </div>
          </div>
          <div className="pdm-field">
            <label>Additional comments</label>
            <textarea className="pdm-input" rows={2} value={fbText} onChange={(e) => setFbText(e.target.value)} />
          </div>
          <button className="pdm-btn" onClick={submitFeedback}>Submit feedback</button>
          {fbMsg && <div style={{ marginTop: "0.6rem" }}><Alert type={fbMsg.type}>{fbMsg.text}</Alert></div>}
        </div>
      )}

      <SectionTitle icon="🏁">Completed maintenance tasks</SectionTitle>
      {completedTasks.length > 0 ? (
        <div className="pdm-table-wrap">
          <table className="pdm-table">
            <thead><tr><th>ID</th><th>Machine</th><th>Failure mode</th><th>Status</th></tr></thead>
            <tbody>
              {completedTasks.map((t) => (
                <tr key={t.id}><td>{t.id}</td><td>{t.machine_id}</td><td>{t.failure_mode}</td><td>{t.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Alert type="info">No completed tasks yet.</Alert>
      )}
    </div>
  );
}
