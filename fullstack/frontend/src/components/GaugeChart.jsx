/** A lightweight animated SVG arc gauge (no external chart library needed). */
export default function GaugeChart({
  probability = 0,
  title = "",
  warningThreshold = 0.3,
  criticalThreshold = 0.7,
  size = 200,
}) {
  const pct = Math.min(1, Math.max(0, probability));
  const color = pct >= criticalThreshold ? "#dc2626" : pct >= warningThreshold ? "#f59e0b" : "#16a34a";

  const radius = 80;
  const circumference = Math.PI * radius; // half circle
  const dash = pct * circumference;

  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 200 120" width="100%" style={{ maxWidth: size }}>
        {/* Background track */}
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Colored zones (subtle) */}
        <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="#f8fafc" strokeWidth="16" opacity="0" />
        {/* Value arc */}
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease" }}
        />
        <text x="100" y="95" textAnchor="middle" fontSize="28" fontWeight="800" fontFamily="Sora, sans-serif" fill="#0f172a">
          {(pct * 100).toFixed(0)}%
        </text>
        {title && (
          <text x="100" y="115" textAnchor="middle" fontSize="11" fill="#64748b" fontFamily="Inter, sans-serif">
            {title}
          </text>
        )}
      </svg>
    </div>
  );
}
