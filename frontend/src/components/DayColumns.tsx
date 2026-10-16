import { useState } from "react";
import { count } from "../lib/owner";

// A count per day as columns, for the Owner's dashboard: one series in the
// chart teal (--chart), so no legend; the title says what it counts. Tap or
// hover a day for its number; the same numbers are in the table below it.

export interface DayValue {
  day: string; // "2026-10-16"
  value: number;
}

const W = 300;
const H = 110;
const SLOT_GAP = 2;

export const shortDay = (day: string) =>
  new Date(`${day}T12:00:00+02:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "Africa/Johannesburg" });

// The axis's top: a clean number at or above the largest value.
export function niceMax(max: number): number {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= max) return m * step;
  return 10 * step;
}

// A column with its top corners rounded and its foot square on the baseline.
function column(x: number, w: number, h: number): string {
  const r = Math.min(3, w / 2, h);
  const y = H - h;
  return `M${x},${H}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${H}Z`;
}

export function DayColumns({
  title,
  days,
  noun,
  guide,
}: {
  title: string;
  days: DayValue[];
  /** What one of them is called, and many: ["account", "accounts"]. */
  noun: [string, string];
  /** A reference line, such as the daily credit guide. */
  guide?: { value: number; label: string };
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const top = niceMax(Math.max(...days.map((d) => d.value), guide?.value ?? 0));
  const slot = W / days.length;
  const barW = Math.min(24, slot - SLOT_GAP);
  const total = days.reduce((sum, d) => sum + d.value, 0);
  const words = (n: number) => `${count(n)} ${n === 1 ? noun[0] : noun[1]}`;
  const shown = picked === null ? null : days[picked];

  return (
    <figure className="owner-chart">
      <figcaption>
        <span className="owner-chart-title">{title}</span>
        <span className="owner-chart-readout" aria-live="polite">
          {shown ? `${shortDay(shown.day)}: ${words(shown.value)}` : `${words(total)} in ${days.length} days`}
        </span>
      </figcaption>
      <div className="owner-chart-plot">
        <span className="owner-chart-tick" aria-hidden="true">{count(top)}</span>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title}: ${words(total)} in the last ${days.length} days`}
          onPointerLeave={() => setPicked(null)}
        >
          <line className="owner-chart-grid" x1="0" x2={W} y1={0.5} y2={0.5} vectorEffect="non-scaling-stroke" />
          <line className="owner-chart-axis" x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} vectorEffect="non-scaling-stroke" />
          {guide && (
            <line
              className="owner-chart-guide"
              x1="0"
              x2={W}
              y1={H - (guide.value / top) * H}
              y2={H - (guide.value / top) * H}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {days.map((d, i) => {
            const h = (d.value / top) * H;
            const x = i * slot + (slot - barW) / 2;
            return (
              <g key={d.day}>
                {h > 0 && <path className={`owner-chart-bar${picked === i ? " owner-chart-bar--on" : ""}`} d={column(x, barW, h)} />}
                {/* The whole day's slot answers a tap, not just its column. */}
                <rect
                  className="owner-chart-hit"
                  x={i * slot}
                  y={0}
                  width={slot}
                  height={H}
                  onPointerEnter={() => setPicked(i)}
                  onPointerDown={() => setPicked(i)}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="owner-chart-days" aria-hidden="true">
        <span>{shortDay(days[0].day)}</span>
        {guide && <span className="owner-chart-guide-label">┄ {guide.label}</span>}
        <span>Today</span>
      </div>
      <details className="owner-chart-table">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{noun[1][0].toUpperCase() + noun[1].slice(1)}</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day}>
                <td>{shortDay(d.day)}</td>
                <td>{count(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
