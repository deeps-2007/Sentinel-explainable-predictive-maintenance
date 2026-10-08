import { useAuth } from "../context/AuthContext.jsx";
import { SectionTitle } from "../components/Atoms.jsx";

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

export default function Home() {
  const { user } = useAuth();

  return (
    <div>
      <div className="pdm-hero">
        <h1>Welcome back, {user?.full_name || user?.username} 👋</h1>
        <p>Logged in as {user?.role} · Explainable Predictive Maintenance and Recommendation System</p>
      </div>

      <SectionTitle icon="🧭">Navigate the dashboard</SectionTitle>
      <div className="pdm-nav-grid">
        {NAV_CARDS.map((c) => (
          <div key={c.title} className="pdm-nav-card">
            <div className="icon">{c.icon}</div>
            <div className="title">{c.title}</div>
            <div className="desc">{c.desc}</div>
          </div>
        ))}
      </div>

      <SectionTitle icon="🚀">Getting started</SectionTitle>
      <div className="pdm-grid-3">
        <div className="pdm-card">
          <strong>1️⃣ Set up the database</strong>
          <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: "0.6rem", borderRadius: 8, marginTop: 8, fontSize: "0.78rem", overflowX: "auto" }}>
            npm run migrate
          </pre>
        </div>
        <div className="pdm-card">
          <strong>2️⃣ Train / serve models</strong>
          <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: "0.6rem", borderRadius: 8, marginTop: 8, fontSize: "0.78rem", overflowX: "auto" }}>
            uvicorn main:app --port 8001
          </pre>
        </div>
        <div className="pdm-card">
          <strong>3️⃣ Upload data</strong>
          <p style={{ fontSize: "0.85rem", color: "#475569", marginTop: 8 }}>
            Go to <b>CSV Upload</b>, upload readings, then click <b>Run Prediction</b>.
          </p>
        </div>
      </div>
    </div>
  );
}
