import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Alert, Spinner } from "../components/Atoms.jsx";

const ROLES = [
  "Maintenance Engineer",
  "Maintenance Technician",
  "Maintenance Manager",
  "Operator",
];
const ROLE_ICONS = {
  "Maintenance Engineer": "🧑‍🔧",
  "Maintenance Technician": "🛠️",
  "Maintenance Manager": "📋",
  Operator: "🎛️",
};

const NAV_CARDS = [
  { icon: "📊", title: "Fleet Overview", desc: "Fleet-wide health summary and interactive charts." },
  { icon: "📤", title: "CSV Upload", desc: "Upload, validate, and store new machine readings." },
  { icon: "🔍", title: "Machine Prediction", desc: "Failure probability & failure modes for a reading." },
  { icon: "🧠", title: "SHAP Explanation", desc: "Understand why the model predicted what it predicted." },
  { icon: "🧪", title: "What-If Simulator", desc: "Test hypothetical sensor changes and find lower-risk settings." },
  { icon: "✅", title: "Recommendations", desc: "Ranked, explainable maintenance recommendations per machine." },
  { icon: "🧰", title: "Maintenance Tasks", desc: "Approve recommendations and track simulated work orders." },
  { icon: "📈", title: "Model Monitoring", desc: "Model performance, prediction history, and feedback." },
];

export default function Login() {
  const [tab, setTab] = useState("login");
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const [loginForm, setLoginForm] = useState({ identifier: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    full_name: "",
    username: "",
    email: "",
    role: ROLES[0],
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const result = await login(loginForm.identifier, loginForm.password);
    setLoading(false);
    if (result.success) {
      navigate("/");
    } else {
      setMessage({ type: "error", text: result.message });
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    if (signupForm.password !== signupForm.confirm) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    setLoading(true);
    setMessage(null);
    const result = await signup({
      username: signupForm.username,
      email: signupForm.email,
      password: signupForm.password,
      role: signupForm.role,
      full_name: signupForm.full_name,
    });
    setLoading(false);
    if (result.success) {
      setMessage({ type: "success", text: `${result.message} Switch to the Log In tab to continue.` });
      setTab("login");
    } else {
      setMessage({ type: "error", text: result.message });
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "1.5rem auto", padding: "0 1rem" }}>
      <div className="pdm-hero">
        <h1>🛠️ Explainable Predictive Maintenance</h1>
        <p>Decision-support platform built on the UCI AI4I 2020 Predictive Maintenance Dataset</p>
      </div>

      <div className="pdm-auth-card">
        <div className="pdm-tabs">
          <button className={`pdm-tab${tab === "login" ? " active" : ""}`} onClick={() => setTab("login")}>
            🔑 Log In
          </button>
          <button className={`pdm-tab${tab === "signup" ? " active" : ""}`} onClick={() => setTab("signup")}>
            ✨ Create Account
          </button>
        </div>

        {message && <Alert type={message.type}>{message.text}</Alert>}

        {tab === "login" ? (
          <form onSubmit={handleLogin}>
            <h3 style={{ marginBottom: 4 }}>Welcome back 👋</h3>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Sign in to access the fleet dashboard, predictions, and recommendations.
            </p>
            <div className="pdm-field">
              <label>Username or email</label>
              <input
                className="pdm-input"
                placeholder="jane.doe"
                value={loginForm.identifier}
                onChange={(e) => setLoginForm({ ...loginForm, identifier: e.target.value })}
                required
              />
            </div>
            <div className="pdm-field">
              <label>Password</label>
              <input
                className="pdm-input"
                type="password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required
              />
            </div>
            <button className="pdm-btn block" disabled={loading}>
              {loading ? <Spinner /> : "🔓 Log in"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <h3 style={{ marginBottom: 4 }}>Create your account ✨</h3>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
              Choose the role that matches your job function:
            </p>
            <div style={{ marginBottom: "1rem" }}>
              {ROLES.map((r) => (
                <span key={r} className="pdm-role-chip">
                  {ROLE_ICONS[r]} {r}
                </span>
              ))}
            </div>
            <div className="pdm-field">
              <label>Full name</label>
              <input
                className="pdm-input"
                placeholder="Jane Doe"
                value={signupForm.full_name}
                onChange={(e) => setSignupForm({ ...signupForm, full_name: e.target.value })}
              />
            </div>
            <div className="pdm-field">
              <label>Choose a username</label>
              <input
                className="pdm-input"
                placeholder="jane.doe"
                value={signupForm.username}
                onChange={(e) => setSignupForm({ ...signupForm, username: e.target.value })}
                required
              />
            </div>
            <div className="pdm-field">
              <label>Email</label>
              <input
                className="pdm-input"
                type="email"
                placeholder="jane.doe@example.com"
                value={signupForm.email}
                onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                required
              />
            </div>
            <div className="pdm-field">
              <label>Role</label>
              <select
                className="pdm-select"
                value={signupForm.role}
                onChange={(e) => setSignupForm({ ...signupForm, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_ICONS[r]} {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="pdm-field">
              <label>Password (at least 8 characters)</label>
              <input
                className="pdm-input"
                type="password"
                value={signupForm.password}
                onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                required
              />
            </div>
            <div className="pdm-field">
              <label>Confirm password</label>
              <input
                className="pdm-input"
                type="password"
                value={signupForm.confirm}
                onChange={(e) => setSignupForm({ ...signupForm, confirm: e.target.value })}
                required
              />
            </div>
            <button className="pdm-btn block" disabled={loading}>
              {loading ? <Spinner /> : "🚀 Create account"}
            </button>
          </form>
        )}
      </div>

      <div className="pdm-section-title" style={{ marginTop: "1.6rem" }}>
        <span className="bar" />
        🧭 What you'll find inside
      </div>
      <div className="pdm-nav-grid">
        {NAV_CARDS.map((c) => (
          <div key={c.title} className="pdm-nav-card">
            <div className="icon">{c.icon}</div>
            <div className="title">{c.title}</div>
            <div className="desc">{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
