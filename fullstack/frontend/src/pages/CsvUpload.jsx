import { useEffect, useState } from "react";
import Papa from "papaparse";
import { api, apiErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { KpiRow, SectionTitle, Alert, Spinner } from "../components/Atoms.jsx";

const TECHNICIAN = "Maintenance Technician";

export default function CsvUpload() {
  const { user } = useAuth();
  const isReadOnly = user?.role === TECHNICIAN;
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [isSimulated, setIsSimulated] = useState(false);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  function loadHistory() {
    api.get("/upload/history").then(({ data }) => setHistory(data.files)).catch(() => {});
  }

  function handleFileChange(e) {
    const f = e.target.files[0];
    setFile(f);
    setResult(null);
    setError(null);
    if (f) {
      Papa.parse(f, {
        header: true,
        preview: 20,
        complete: (res) => setPreview(res.data.filter((r) => Object.values(r).some((v) => v))),
      });
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    setRunMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("replace_existing", String(replaceExisting));
    formData.append("is_simulated", String(isSimulated));
    try {
      const { data } = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      loadHistory();
    } catch (err) {
      setError(apiErrorMessage(err, "Ingestion failed."));
    } finally {
      setUploading(false);
    }
  }

  async function handleRunPrediction() {
    if (!result?.uploaded_file_id) return;
    setRunning(true);
    setRunMessage(null);
    try {
      const { data } = await api.post(`/predictions/run/${result.uploaded_file_id}`);
      setRunMessage({ type: "success", text: `Scored ${data.n_scored} readings. See Fleet Overview / Machine Prediction pages.` });
    } catch (err) {
      setRunMessage({ type: "error", text: apiErrorMessage(err, "Prediction run failed.") });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="pdm-hero">
        <h1>📤 CSV Upload</h1>
        <p>Upload, validate, and store new machine readings</p>
      </div>

      <Alert type="info">
        💡 <b>Daily snapshot mode (default):</b> each upload replaces the fleet's current readings,
        predictions, and recommendations, so the dashboard always reflects only today's data — old
        readings won't pile up or look like new machines. Approved maintenance tasks and feedback
        history are kept.
      </Alert>

      {isReadOnly ? (
        <Alert type="warning">
          🔒 <b>Read-only access:</b> as a Maintenance Technician you can view predictions and the
          uploaded-dataset history below, but only a Maintenance Manager or Maintenance Engineer can
          upload a new dataset or run the prediction pipeline.
        </Alert>
      ) : (
        <>
      <div className="pdm-grid-2" style={{ marginBottom: "1rem" }}>
        <label className="pdm-card" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
          🔄 Replace existing fleet data with this upload (recommended for daily updates)
        </label>
        <label className="pdm-card" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={isSimulated} onChange={(e) => setIsSimulated(e.target.checked)} />
          Mark this upload as simulated/demo data
        </label>
      </div>

      {!replaceExisting && (
        <Alert type="warning">
          Append mode selected: previous readings will be kept, and this upload will be added alongside them.
        </Alert>
      )}

      <div className="pdm-card" style={{ marginBottom: "1.2rem" }}>
        <input type="file" accept=".csv" onChange={handleFileChange} />
      </div>

      {preview.length > 0 && (
        <>
          <SectionTitle icon="👀">Preview</SectionTitle>
          <div className="pdm-table-wrap" style={{ marginBottom: "1rem", maxHeight: 300, overflow: "auto" }}>
            <table className="pdm-table">
              <thead>
                <tr>{Object.keys(preview[0]).map((k) => <th key={k}>{k}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>{Object.keys(preview[0]).map((k) => <td key={k}>{row[k]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="pdm-btn" disabled={uploading} onClick={handleUpload}>
            {uploading ? <Spinner /> : replaceExisting ? "🔄 Replace Fleet Data & Store in MySQL" : "➕ Append & Store in MySQL"}
          </button>
        </>
      )}

      {error && <div style={{ marginTop: "1rem" }}><Alert type="error">{error}</Alert></div>}

      {result && (
        <div style={{ marginTop: "1.2rem" }}>
          <KpiRow
            items={[
              { label: "Rows received", value: result.total_rows, icon: "📥", color: "#4f46e5" },
              { label: "Valid rows", value: result.valid_rows, icon: "✅", color: "#16a34a" },
              { label: "Duplicate rows", value: result.duplicate_rows, icon: "🧬", color: "#f59e0b" },
              { label: "Invalid rows", value: result.invalid_rows, icon: "🚫", color: "#dc2626" },
            ]}
          />
          {!result.is_valid_file ? (
            <Alert type="error">File is missing required columns and could not be processed.</Alert>
          ) : result.valid_rows === 0 ? (
            <Alert type="warning">No valid rows were found to store.</Alert>
          ) : result.replace_existing ? (
            <Alert type="success">
              Fleet data replaced — {result.valid_rows} readings from this upload are now the dashboard's current snapshot.
            </Alert>
          ) : (
            <Alert type="success">Stored {result.valid_rows} valid readings in MySQL (appended).</Alert>
          )}

          {result.uploaded_file_id && result.valid_rows > 0 && (
            <>
              <SectionTitle icon="▶️">Run Prediction</SectionTitle>
              <button className="pdm-btn" disabled={running} onClick={handleRunPrediction}>
                {running ? <Spinner /> : "▶️ Run Prediction"}
              </button>
              {runMessage && <div style={{ marginTop: "0.8rem" }}><Alert type={runMessage.type}>{runMessage.text}</Alert></div>}
            </>
          )}
        </div>
      )}
        </>
      )}

      <SectionTitle icon="📜">Upload history</SectionTitle>
      <p style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "0.6rem" }}>
        This log is kept as an audit trail even in replace mode — only the underlying readings from earlier uploads are cleared.
      </p>
      <div className="pdm-table-wrap">
        <table className="pdm-table">
          <thead>
            <tr><th>Filename</th><th>Uploaded</th><th>Rows</th><th>Valid</th><th>Status</th></tr>
          </thead>
          <tbody>
            {history.map((f) => (
              <tr key={f.id}>
                <td>{f.filename}</td>
                <td>{new Date(f.upload_date).toLocaleString()}</td>
                <td>{f.row_count}</td>
                <td>{f.valid_row_count}</td>
                <td>{f.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
