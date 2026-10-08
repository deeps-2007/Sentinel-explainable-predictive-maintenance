import { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { KpiRow, SectionTitle, Alert, Spinner } from "../components/Atoms.jsx";

const ENGINEER = "Maintenance Engineer";
const TECHNICIAN = "Maintenance Technician";
const MANAGER = "Maintenance Manager";
const TECHNICIAN_STATUSES = ["Open", "In Progress", "Completed"];
const STATUS_COLOR = { Open: "#4f46e5", "In Progress": "#f59e0b", Completed: "#16a34a", Verified: "#06b6d4" };

function StatusPill({ status }) {
  return (
    <span className="pdm-badge" style={{ backgroundColor: STATUS_COLOR[status] || "#64748b" }}>
      {status}
    </span>
  );
}

export default function MaintenanceTasks() {
  const { user } = useAuth();
  const role = user?.role;

  const [tasks, setTasks] = useState([]);
  const [statusFilter, setStatusFilter] = useState(["Open", "In Progress", "Completed", "Verified"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Engineer: approve & assign ---
  const [approved, setApproved] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selectedRecId, setSelectedRecId] = useState(null);
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [createMsg, setCreateMsg] = useState(null);

  // --- Technician: my tasks ---
  const [workingTaskId, setWorkingTaskId] = useState(null);

  // --- Manager: awaiting verification ---
  const [awaitingVerification, setAwaitingVerification] = useState([]);
  const [verifyMsg, setVerifyMsg] = useState(null);

  // --- SLA alerts (Technician: overdue work; Manager: overdue verification) ---
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    loadTasks();
    if (role === ENGINEER) {
      loadApproved();
      loadTechnicians();
    }
    if (role === MANAGER) {
      loadAwaitingVerification();
    }
    if (role === TECHNICIAN || role === MANAGER) {
      loadAlerts();
      const interval = setInterval(loadAlerts, 60000);
      return () => clearInterval(interval);
    }
  }, [role]);

  useEffect(() => { loadTasks(); }, [statusFilter]);

  function loadTasks() {
    setLoading(true);
    const params = { status: statusFilter.join(",") };
    if (role === TECHNICIAN && user?.username) params.assigned_to = user.username;
    api.get("/tasks", { params })
      .then(({ data }) => setTasks(data.tasks))
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  function loadApproved() {
    api.get("/tasks/approved-recommendations")
      .then(({ data }) => {
        setApproved(data.recommendations);
        if (data.recommendations.length > 0) setSelectedRecId(data.recommendations[0].recommendation_id);
      })
      .catch((err) => setError(apiErrorMessage(err)));
  }

  function loadTechnicians() {
    api.get("/users/technicians")
      .then(({ data }) => {
        setTechnicians(data.technicians);
        if (data.technicians.length > 0) {
          setAssignedTo(data.technicians[0].username);
        }
      })
      .catch((err) => setError(apiErrorMessage(err)));
  }

  function loadAwaitingVerification() {
    api.get("/tasks/awaiting-verification")
      .then(({ data }) => setAwaitingVerification(data.tasks))
      .catch((err) => setError(apiErrorMessage(err)));
  }

  function loadAlerts() {
    api.get("/tasks/alerts")
      .then(({ data }) => setAlerts(data.tasks))
      .catch(() => {});
  }

  async function handleCreateTask() {
    const rec = approved.find((r) => r.recommendation_id === selectedRecId);
    if (!rec || !assignedTo) return;
    try {
      await api.post("/tasks", {
        machine_id: rec.machine_id,
        prediction_id: rec.prediction_id,
        recommendation_id: rec.recommendation_id,
        failure_mode: rec.failure_mode,
        recommended_action: rec.recommendation_text,
        priority,
        assigned_to: assignedTo,
        deadline_hours: deadlineHours ? Number(deadlineHours) : null,
      });
      setCreateMsg({
        type: "success",
        text: deadlineHours
          ? `Task created and assigned to ${assignedTo} - due within ${deadlineHours}h.`
          : `Task created and assigned to ${assignedTo}.`,
      });
      loadApproved();
      loadTasks();
    } catch (err) {
      setCreateMsg({ type: "error", text: apiErrorMessage(err) });
    }
  }

  async function handleTechnicianUpdate(taskId, status) {
    setWorkingTaskId(taskId);
    try {
      await api.patch(`/tasks/${taskId}`, { status });
      loadTasks();
      loadAlerts();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setWorkingTaskId(null);
    }
  }

  async function handleVerify(taskId) {
    setVerifyMsg(null);
    try {
      await api.patch(`/tasks/${taskId}`, { status: "Verified" });
      setVerifyMsg({ type: "success", text: `Task #${taskId} verified.` });
      loadAwaitingVerification();
      loadTasks();
      loadAlerts();
    } catch (err) {
      setVerifyMsg({ type: "error", text: apiErrorMessage(err) });
    }
  }

  function exportCsv() {
    if (tasks.length === 0) return;
    const headers = Object.keys(tasks[0]);
    const rows = tasks.map((t) => headers.map((h) => JSON.stringify(t[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "maintenance_tasks.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleFilter(status) {
    setStatusFilter((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  }

  const statusCounts = useMemo(() => ({
    Open: tasks.filter((t) => t.status === "Open").length,
    InProgress: tasks.filter((t) => t.status === "In Progress").length,
    Completed: tasks.filter((t) => t.status === "Completed").length,
    Verified: tasks.filter((t) => t.status === "Verified").length,
  }), [tasks]);

  return (
    <div>
      <div className="pdm-hero">
        <h1>🧰 Maintenance Tasks</h1>
        <p>
          {role === ENGINEER && "Approve recommendations and assign them to a registered technician"}
          {role === TECHNICIAN && "Work the tasks assigned to you"}
          {role === MANAGER && "Track the fleet's work orders and verify completed work"}
          {![ENGINEER, TECHNICIAN, MANAGER].includes(role) && "Simulated maintenance work-order tracking"}
        </p>
      </div>

      <Alert type="warning">
        All tasks here are <b>simulated work orders</b> for tracking purposes only. This system never
        automatically controls or stops a real machine.
      </Alert>

      <div className="pdm-card" style={{ marginBottom: "1.2rem", fontSize: "0.85rem" }}>
        <b>How this works:</b>{" "}
        <span style={{ color: "#4f46e5", fontWeight: 700 }}>Maintenance Engineer</span> approves a
        recommendation and assigns it to a registered{" "}
        <span style={{ color: "#f59e0b", fontWeight: 700 }}>Maintenance Technician</span>, who moves it
        through Open → In Progress → Completed. A{" "}
        <span style={{ color: "#06b6d4", fontWeight: 700 }}>Maintenance Manager</span> then verifies
        completed work, moving it to Verified.
      </div>

      <KpiRow items={[
        { label: "Open", value: statusCounts.Open, icon: "🆕", color: STATUS_COLOR.Open },
        { label: "In progress", value: statusCounts.InProgress, icon: "⚙️", color: STATUS_COLOR["In Progress"] },
        { label: "Completed", value: statusCounts.Completed, icon: "✅", color: STATUS_COLOR.Completed },
        { label: "Verified", value: statusCounts.Verified, icon: "🔒", color: STATUS_COLOR.Verified },
      ]} />

      {error && <Alert type="error">{error}</Alert>}

      {/* ---------------- Maintenance Engineer: approve & assign ---------------- */}
      {role === ENGINEER && (
        <>
          <SectionTitle icon="➕">Approve &amp; assign a recommendation</SectionTitle>
          {approved.length === 0 ? (
            <Alert type="info">No approved recommendations awaiting assignment. Approve one on the Recommendations page.</Alert>
          ) : technicians.length === 0 ? (
            <Alert type="warning">
              No Maintenance Technicians are registered yet. A technician must sign up before you can assign a task.
            </Alert>
          ) : (
            <div className="pdm-card" style={{ maxWidth: 560 }}>
              <div className="pdm-field">
                <label>Approved recommendation</label>
                <select className="pdm-select" value={selectedRecId || ""} onChange={(e) => setSelectedRecId(Number(e.target.value))}>
                  {approved.map((r) => (
                    <option key={r.recommendation_id} value={r.recommendation_id}>
                      #{r.recommendation_id} · {r.machine_id} · {r.failure_mode} · urgency: {r.urgency}
                    </option>
                  ))}
                </select>
              </div>
              {selectedRecId && (
                <p style={{ fontSize: "0.85rem" }}>
                  <b>Recommended action:</b> {approved.find((r) => r.recommendation_id === selectedRecId)?.recommendation_text}
                </p>
              )}
              <div className="pdm-field">
                <label>Assign to technician</label>
                <select className="pdm-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.username}>
                      {t.full_name ? `${t.full_name} (${t.username})` : t.username}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: 4 }}>
                  Only registered, active Maintenance Technicians appear here.
                </p>
              </div>
              <div className="pdm-field">
                <label>Priority</label>
                <select className="pdm-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {["Low", "Medium", "High", "Critical"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="pdm-field">
                <label>Technician deadline (hours)</label>
                <input
                  type="number"
                  min="1"
                  className="pdm-select"
                  value={deadlineHours}
                  onChange={(e) => setDeadlineHours(e.target.value)}
                  placeholder="e.g. 24"
                />
                <p style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: 4 }}>
                  If the technician hasn't moved this task forward within this many hours, it will show
                  as overdue on their dashboard. Leave blank for no deadline.
                </p>
              </div>
              <Alert type="info">Creating a task requires this explicit human confirmation step.</Alert>
              <button className="pdm-btn" onClick={handleCreateTask}>
                Confirm &amp; Assign to {assignedTo || "…"}
              </button>
              {createMsg && <div style={{ marginTop: "0.8rem" }}><Alert type={createMsg.type}>{createMsg.text}</Alert></div>}
            </div>
          )}
        </>
      )}

      {/* ---------------- Maintenance Technician: my tasks ---------------- */}
      {role === TECHNICIAN && (
        <>
          {alerts.length > 0 && (
            <Alert type="error">
              ⏰ <b>{alerts.length} task{alerts.length > 1 ? "s" : ""} overdue:</b>{" "}
              {alerts.map((a) => `#${a.id} (${a.machine_id})`).join(", ")} — the deadline your engineer
              set has passed. Please update their status.
            </Alert>
          )}
          <SectionTitle icon="🧑‍🔧">My assigned tasks</SectionTitle>
          {loading ? (
            <Spinner />
          ) : tasks.length === 0 ? (
            <Alert type="info">No tasks are currently assigned to you.</Alert>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                className="pdm-card"
                style={{ marginBottom: "0.8rem", borderLeft: t.is_overdue ? "4px solid #dc2626" : undefined }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <b>🏭 {t.machine_id}</b> · {t.failure_mode || "General"} · Priority: {t.priority}
                    <p style={{ fontSize: "0.85rem", color: "#475569", margin: "4px 0" }}>{t.recommended_action}</p>
                    <StatusPill status={t.status} />
                    {!!t.is_overdue && <span className="pdm-badge" style={{ backgroundColor: "#dc2626", marginLeft: 6 }}>⏰ Overdue</span>}
                    {t.due_at && <span style={{ fontSize: "0.76rem", color: "#94a3b8", marginLeft: 8 }}>Due: {new Date(t.due_at).toLocaleString()}</span>}
                  </div>
                  {t.status !== "Verified" && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {TECHNICIAN_STATUSES.filter((s) => s !== t.status).map((s) => (
                        <button
                          key={s}
                          className="pdm-btn sm secondary"
                          disabled={workingTaskId === t.id}
                          onClick={() => handleTechnicianUpdate(t.id, s)}
                        >
                          {workingTaskId === t.id ? <Spinner /> : `Move to ${s}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* ---------------- Maintenance Manager: verification + overview ---------------- */}
      {role === MANAGER && (
        <>
          {alerts.length > 0 && (
            <Alert type="error">
              ⏰ <b>{alerts.length} verification{alerts.length > 1 ? "s" : ""} overdue:</b>{" "}
              {alerts.map((a) => `#${a.id} (${a.machine_id})`).join(", ")} — completed more than 24h
              ago and still waiting on you.
            </Alert>
          )}
          <SectionTitle icon="🔎">Completed — awaiting verification</SectionTitle>
          <p style={{ color: "#64748b", fontSize: "0.82rem" }}>
            Only a Manager can move a task from Completed to Verified. Each task has a 24-hour
            verification window from the moment the technician completed it.
          </p>
          {verifyMsg && <Alert type={verifyMsg.type}>{verifyMsg.text}</Alert>}
          {awaitingVerification.length === 0 ? (
            <Alert type="info">No completed tasks are waiting for verification.</Alert>
          ) : (
            <div className="pdm-table-wrap" style={{ marginBottom: "1.4rem" }}>
              <table className="pdm-table">
                <thead>
                  <tr><th>ID</th><th>Machine</th><th>Failure mode</th><th>Assigned</th><th>Completed at</th><th>SLA</th><th></th></tr>
                </thead>
                <tbody>
                  {awaitingVerification.map((t) => (
                    <tr key={t.id} style={t.is_overdue ? { backgroundColor: "rgba(220,38,38,0.08)" } : undefined}>
                      <td>{t.id}</td><td>{t.machine_id}</td><td>{t.failure_mode || "—"}</td>
                      <td>{t.assigned_to || "—"}</td>
                      <td>{t.completed_at ? new Date(t.completed_at).toLocaleString() : "—"}</td>
                      <td>{t.is_overdue ? <span className="pdm-badge" style={{ backgroundColor: "#dc2626" }}>⏰ Overdue</span> : "On time"}</td>
                      <td><button className="pdm-btn success sm" onClick={() => handleVerify(t.id)}>✅ Verify</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ---------------- Shared overview table (all roles) ---------------- */}
      <SectionTitle icon="📋">{role === ENGINEER || role === MANAGER ? "All tasks" : "Fleet work orders"}</SectionTitle>
      <div className="pdm-field">
        <label>Filter by status</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Open", "In Progress", "Completed", "Verified"].map((s) => (
            <button key={s} className={`pdm-btn sm ${statusFilter.includes(s) ? "" : "secondary"}`} onClick={() => toggleFilter(s)}>{s}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : tasks.length === 0 ? (
        <Alert type="info">No tasks match the selected filters.</Alert>
      ) : (
        <>
          <div className="pdm-table-wrap" style={{ marginBottom: "1rem" }}>
            <table className="pdm-table">
              <thead>
                <tr><th>ID</th><th>Machine</th><th>Failure mode</th><th>Priority</th><th>Assigned to</th><th>Approved by</th><th>Status</th></tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td><td>{t.machine_id}</td><td>{t.failure_mode || "—"}</td>
                    <td>{t.priority}</td><td>{t.assigned_to || "—"}</td><td>{t.approved_by || "—"}</td>
                    <td><StatusPill status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="pdm-btn secondary" onClick={exportCsv}>⬇️ Export tasks as CSV</button>
        </>
      )}
    </div>
  );
}
