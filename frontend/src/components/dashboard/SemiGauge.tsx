interface SemiGaugeProps {
  label: string;
  display: string;
  value: number;
  max: number;
  color: string;
  pct?: number | null;
  invert?: boolean;
}

export function formatPct(pct: number | null | undefined): string | null {
  if (pct == null || Number.isNaN(pct)) return null;
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function trendColor(pct: number | null | undefined, invert = false): string {
  if (pct == null || Number.isNaN(pct) || pct === 0) {
    return invert ? "var(--muted)" : "var(--primary)";
  }
  const up = pct > 0;
  const favorable = invert ? !up : up;
  return favorable ? "var(--success)" : "var(--danger)";
}

export function PctBadge({ pct, invert = false }: { pct: number | null | undefined; invert?: boolean }) {
  const label = formatPct(pct);
  if (!label) return <span className="widget-pct muted">—</span>;
  const up = Boolean(pct && pct > 0);
  const down = Boolean(pct && pct < 0);
  const favorable = invert ? down : up;
  const unfavorable = invert ? up : down;
  return <span className={`widget-pct ${favorable ? "up" : unfavorable ? "down" : ""}`}>{label}</span>;
}

export default function SemiGauge({ label, display, value, max, color, pct, invert = false }: SemiGaugeProps) {
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
      <PctBadge pct={pct} invert={invert} />
    </div>
  );
}
