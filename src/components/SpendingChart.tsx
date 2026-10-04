import { chartScale, monthLabel, type CategoryPlan } from "../api/planning";
import { money } from "../lib/money";

export function SpendingChart({
  plan,
  onToggle,
}: {
  plan: CategoryPlan;
  onToggle: (month: string) => void;
}) {
  const w = 680,
    h = 250,
    left = 62,
    top = 26,
    bottom = 35,
    cw = w - left - 16,
    ch = h - top - bottom;
  const negative = Math.min(0, ...plan.history.map((m) => m.amount));
  const peak = Math.max(
    0,
    ...plan.history.map((m) => m.amount),
    ...(plan.type === "oneoff" ? [] : [plan.current ?? 0, plan.proposed ?? 0]),
  );
  const scale = chartScale(Math.max(peak, -negative));
  const max = peak === 0 && negative < 0 ? 0 : scale.max,
    step = scale.step;
  const min = Math.floor(negative / step) * step;
  const ys = (v: number) => top + ch * (1 - (v - min) / (max - min)),
    bw = cw / Math.max(1, plan.history.length);
  const clickable = plan.type === "monthly";
  return (
    <div id="spending-chart">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        data-max={max}
        role="img"
        aria-label="Actual spending by completed month"
      >
        <title>
          Monthly spending, scaled from {money(min)} to {money(max)}
        </title>
        {Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => {
          const y = ys(min + i * step);
          return (
            <g key={i}>
              <line x1={left} x2={w - 16} y1={y} y2={y} stroke="#dde4df" />
              <text
                x={left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#60716f"
              >
                {money(min + i * step, step < 1 ? 2 : 0)}
              </text>
            </g>
          );
        })}
        {plan.history.map((m, i) => {
          const bx = left + i * bw + bw * 0.16;
          return (
            <g key={m.month}>
              <rect
                className="chart-bar"
                x={bx}
                y={Math.min(ys(m.amount), ys(0))}
                width={bw * 0.68}
                height={Math.abs(ys(m.amount) - ys(0))}
                rx={3}
                fill={
                  plan.type === "oneoff" || m.excluded ? "#b9c2bd" : "#6c9d85"
                }
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={`${m.excluded ? "Include" : "Exclude"} ${monthLabel(m.month)} in planning`}
                aria-pressed={clickable ? m.excluded : undefined}
                onClick={() => clickable && onToggle(m.month)}
                onKeyDown={(e) => {
                  if (clickable && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onToggle(m.month);
                  }
                }}
              >
                <title>
                  {monthLabel(m.month)}: {money(m.amount)}
                  {m.excluded ? " (excluded from planning)" : ""}
                </title>
              </rect>
              <text
                x={bx + bw * 0.34}
                y={h - 13}
                textAnchor="middle"
                fontSize={10}
                fill="#60716f"
              >
                {monthLabel(m.month, true)}
              </text>
            </g>
          );
        })}
        {plan.type !== "oneoff" && plan.current !== null && (
          <line
            x1={left}
            x2={w - 16}
            y1={ys(plan.current)}
            y2={ys(plan.current)}
            stroke="#a2633e"
            strokeDasharray="5 4"
            strokeWidth={1.7}
          />
        )}
        {plan.type !== "oneoff" && plan.proposed !== null && (
          <line
            x1={left}
            x2={w - 16}
            y1={ys(plan.proposed)}
            y2={ys(plan.proposed)}
            stroke="#236d59"
            strokeDasharray="2 3"
            strokeWidth={1.5}
          />
        )}
        {plan.history.map((m, i) => {
          const label = money(m.amount);
          return (
            <text
              key={m.month}
              className="bar-amount"
              x={left + i * bw + bw * 0.5}
              y={m.amount < 0 ? ys(m.amount) + 13 : ys(m.amount) - 7}
              textAnchor="middle"
              fontSize={label.length > 6 ? 9 : 10}
              fontWeight={600}
              fill="#294b3a"
              stroke="white"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {label}
            </text>
          );
        })}
        {!plan.history.length && (
          <text
            x={w / 2}
            y={h / 2}
            textAnchor="middle"
            fill="#60716f"
            fontSize={14}
          >
            No completed-month spending history yet
          </text>
        )}
      </svg>
    </div>
  );
}
