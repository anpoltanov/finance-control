interface SemiGaugeProps {
  label: string;
  display: string;
  value: number;
  max: number;
  color: string;
  pct?: number | null;
}

export function formatPct(pct: number | null | undefined): string | null {
  if (pct == null || Number.isNaN(pct)) return null;
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function PctBadge({ pct }: { pct: number | null | undefined }) {
  const label = formatPct(pct);
  if (!label) return <span className="widget-pct muted">—</span>;
  return <span className={`widget-pct ${pct && pct > 0 ? "up" : pct && pct < 0 ? "down" : ""}`}>{label}</span>;
}

export default function SemiGauge({ label, display, value, max, color, pct }: SemiGaugeProps) {
  const radius = 42;
  const circ = Math.PI * radius;
  const ratio = max > 0 ? Math.min(Math.abs(value) / max, 1) : 0;
  const dash = ratio * circ;

  return (
    <div className="semi-gauge">
      <svg viewBox="0 0 100 62" className="semi-gauge-svg" aria-hidden="true">
        <path d="M 8 54 A 42 42 0 0 1 92 54" fill="none" stroke="var(--surface2)" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M 8 54 A 42 42 0 0 1 92 54"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <div className="semi-gauge-value">{display}</div>
      <div className="semi-gauge-label">{label}</div>
      <PctBadge pct={pct} />
    </div>
  );
}
