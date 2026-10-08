import { useMemo, useState } from "react";

const STATUS_COLORS = {
  Healthy: "#16a34a",
  Warning: "#f59e0b",
  Critical: "#dc2626",
  "Not scored": "#94a3b8",
};

const SIZE_PRESETS = {
  sm: { box: 96, view: 200 },
  md: { box: 150, view: 200 },
  lg: { box: 230, view: 200 },
};

/**
 * An interactive, animated SVG illustration of one specific machine.
 *
 * The animation is driven by that machine's *actual* sensor values, not a
 * generic loop:
 *  - Gear rotation speed scales with the machine's rotational speed (rpm).
 *  - The wear bar fills according to its tool wear reading.
 *  - Body color, glow, and the status light pulse according to its current
 *    risk status (Healthy / Warning / Critical).
 *  - Critical machines get a subtle shake to draw the eye.
 *  - Hovering lifts and scales the card and reveals a tooltip with the
 *    machine's key readings.
 */
export default function MachineAvatar({
  machineId,
  type = "M",
  rotationalSpeed = 1500,
  toolWear = 0,
  torque = 40,
  status = "Not scored",
  size = "md",
  interactive = true,
  showLabel = true,
  onClick,
}) {
  const [hovered, setHovered] = useState(false);
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.md;
  const color = STATUS_COLORS[status] || STATUS_COLORS["Not scored"];

  const spinDuration = useMemo(() => {
    // Higher rpm -> faster spin. Clamp to a sane visual range.
    const clamped = Math.min(Math.max(rotationalSpeed, 200), 3000);
    const duration = 7.5 - (clamped / 3000) * 6.5; // ~7.5s (slow) down to ~1s (fast)
    return Math.max(0.9, duration).toFixed(2);
  }, [rotationalSpeed]);

  const wearPct = useMemo(() => {
    const pct = (toolWear / 253) * 100;
    return Math.min(100, Math.max(2, pct));
  }, [toolWear]);

  const isCritical = status === "Critical";
  const isWarning = status === "Warning";

  return (
    <div
      className={`pdm-machine-avatar${interactive ? " interactive" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default", position: "relative" }}
      title={`${machineId} · Type ${type} · ${status}`}
    >
      <div
        className="frame"
        style={{
          width: preset.box,
          height: preset.box,
          animation: isCritical ? "pdmCriticalShake 0.35s ease-in-out infinite" : "none",
        }}
      >
        <svg
          viewBox={`0 0 ${preset.view} ${preset.view}`}
          width="100%"
          height="100%"
          style={{ "--glow-color": color, animation: "pdmGlowPulse 2.4s ease-in-out infinite" }}
        >
          {/* Machine housing */}
          <rect x="30" y="70" width="140" height="95" rx="14" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="2" />
          <rect x="30" y="70" width="140" height="18" rx="9" fill={color} opacity="0.85" />

          {/* Conveyor belt */}
          <line
            x1="20" y1="175" x2="180" y2="175"
            stroke="#94a3b8" strokeWidth="4" strokeDasharray="8 6" strokeLinecap="round"
            style={{ animation: "pdmBeltMove 1.1s linear infinite" }}
          />

          {/* Big gear */}
          <g transform="translate(75,120)">
            <g style={{ transformOrigin: "0px 0px", animation: `pdmGearSpin ${spinDuration}s linear infinite` }}>
              <Gear radius={26} teeth={8} color={color} />
            </g>
          </g>

          {/* Small gear */}
          <g transform="translate(118,132)">
            <g style={{ transformOrigin: "0px 0px", animation: `pdmGearSpinReverse ${(spinDuration * 0.62).toFixed(2)}s linear infinite` }}>
              <Gear radius={15} teeth={7} color="#64748b" />
            </g>
          </g>

          {/* Status light */}
          <circle
            cx="150" cy="55" r="9"
            fill={color}
            style={{ animation: isCritical || isWarning ? "pdmLightBlink 1s ease-in-out infinite" : "none" }}
          />
          <circle cx="150" cy="55" r="9" fill="none" stroke="white" strokeWidth="1.5" opacity="0.6" />

          {/* Type badge */}
          <text x="50" y="82" fontSize="11" fontWeight="800" fill="white" fontFamily="Sora, sans-serif">
            {type}
          </text>

          {/* Tool-wear fill bar */}
          <rect x="30" y="184" width="140" height="8" rx="4" fill="#e2e8f0" />
          <rect
            x="30" y="184" width={(140 * wearPct) / 100} height="8" rx="4"
            fill={wearPct > 80 ? "#dc2626" : wearPct > 50 ? "#f59e0b" : "#16a34a"}
            style={{ transition: "width 0.4s ease" }}
          />
        </svg>
      </div>

      {showLabel && (
        <>
          <span className="label">{machineId}</span>
          <span className="sublabel">{Math.round(rotationalSpeed)} rpm · {Math.round(torque)} Nm</span>
        </>
      )}

      {hovered && interactive && (
        <div
          style={{
            position: "absolute",
            transform: "translateY(4px)",
            background: "#0f172a",
            color: "white",
            fontSize: "0.72rem",
            padding: "6px 10px",
            borderRadius: 8,
            whiteSpace: "nowrap",
            zIndex: 20,
            boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
            pointerEvents: "none",
          }}
        >
          {machineId} · {status} · wear {Math.round(toolWear)} min
        </div>
      )}
    </div>
  );
}

function Gear({ radius, teeth, color }) {
  const points = [];
  for (let i = 0; i < teeth; i += 1) {
    const angle = (i / teeth) * Math.PI * 2;
    const outerR = radius + 5;
    points.push({
      x1: Math.cos(angle) * radius,
      y1: Math.sin(angle) * radius,
      x2: Math.cos(angle) * outerR,
      y2: Math.sin(angle) * outerR,
    });
  }
  return (
    <g>
      {points.map((p, i) => (
        <line
          key={i}
          x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
          stroke={color} strokeWidth="6" strokeLinecap="round"
        />
      ))}
      <circle cx="0" cy="0" r={radius} fill={color} />
      <circle cx="0" cy="0" r={radius * 0.38} fill="white" opacity="0.85" />
      <circle cx="0" cy="0" r={radius * 0.16} fill={color} />
    </g>
  );
}
