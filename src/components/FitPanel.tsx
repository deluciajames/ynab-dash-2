import { useState } from "react";
import type { Category } from "../api/transform";
import type { CategoryPlan } from "../api/planning";
import {
  planChanges,
  type Cushion,
  type FitPlan,
  type PlanChange,
} from "../api/fit";
import type { CoverageScore } from "../api/coverage";
import { money } from "../lib/money";
import { AmountInput } from "./AmountInput";

export interface Planning {
  cushion: Cushion;
  fit: FitPlan;
  rollover: { total: number; lines: { id: string; surplus: number }[] };
  yourScore: CoverageScore;
  fitScore: CoverageScore;
}

interface Props {
  planning: Planning;
  categories: Category[];
  plans: Record<string, CategoryPlan>;
  takeHome: number | null;
  cushionMonthly: number;
  onCushionChange: (value: number) => void;
  onApply: () => void;
  onSelectCategory: (category: Category) => void;
}

const SHOWN = 6;
const times = (n: number) => `${n} ${n === 1 ? "time" : "times"}`;

function ScoreLine({ label, score }: { label: string; score: CoverageScore }) {
  return (
    <div className="score-line">
      <span>{label}</span>
      <strong>{times(score.covers)}</strong>
      <small>
        {score.covers === 0
          ? "No category ran short"
          : [
              score.fromCushionOnly
                ? `${score.fromCushionOnly} from the cushion`
                : "",
              score.fromOtherCategories
                ? `${score.fromOtherCategories} by pulling from other categories`
                : "",
              score.uncoveredTimes
                ? `${score.uncoveredTimes} needed new money (${money(score.uncovered)})`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
      </small>
    </div>
  );
}

export function FitPanel({
  planning,
  categories,
  plans,
  takeHome,
  cushionMonthly,
  onCushionChange,
  onApply,
  onSelectCategory,
}: Props) {
  const { cushion, fit, rollover, yourScore, fitScore } = planning;
  const [showAll, setShowAll] = useState(false);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const name = (id: string) => byId.get(id)?.name ?? "Category";
  const { adds, cuts } = planChanges(fit, plans);
  const cushionDelta = fit.cushion - cushionMonthly;
  const applied = !adds.length && !cuts.length && Math.abs(cushionDelta) < 0.5;
  const shortNote = (id: string) => {
    const s = yourScore.byCategory[id];
    return s?.shortMonths
      ? `ran short ${times(s.shortMonths)} in ${yourScore.months} months`
      : "";
  };
  const reasonText = (c: PlanChange) =>
    c.reason === "usual"
      ? `You usually spend about ${money(plans[c.id]?.need ?? c.to)}`
      : c.reason === "padding"
        ? "Above what you usually spend"
        : `Below your usual ${money(plans[c.id]?.need ?? 0)}: a spending change`;
  const list = (items: PlanChange[], empty: string) => (
    <ol className="change-list">
      {items.length === 0 && <li className="empty">{empty}</li>}
      {(showAll ? items : items.slice(0, SHOWN)).map((c) => (
        <li key={c.id}>
          <button
            className="category-name"
            aria-label={`Open ${name(c.id)} details`}
            onClick={() => {
              const cat = byId.get(c.id);
              if (cat) onSelectCategory(cat);
            }}
          >
            {name(c.id)}
          </button>
          <span className={c.delta > 0 ? "short" : "positive"}>
            {c.delta > 0 ? "+" : "−"}
            {money(Math.abs(c.delta))}
          </span>
          <small>
            {money(c.from)} → {money(c.to)} · {reasonText(c)}
            {c.delta > 0 && shortNote(c.id) ? ` · ${shortNote(c.id)}` : ""}
          </small>
        </li>
      ))}
    </ol>
  );
  const addTotal = adds.reduce((s, c) => s + c.delta, 0),
    cutTotal = cuts.reduce((s, c) => s - c.delta, 0);
  const donors = yourScore.donorRanking.slice(0, 3),
    shorts = yourScore.shortRanking.slice(0, 3);
  return (
    <section className="fit-section" aria-labelledby="fit-title">
      <div className="fit-heading">
        <div>
          <div className="eyebrow">Fit to your income</div>
          <h2 id="fit-title">Realistic where it counts. Affordable overall.</h2>
          <p>
            Each line is planned at your typical month. One shared cushion,
            sized by replaying the last {cushion.months} months, covers the
            months that run over, so you aren’t pulling from other categories.
            If that’s still over your income, flexible lines are trimmed toward
            the floor you set.
          </p>
        </div>
      </div>
      <div className="fit-stats">
        <div className="fit-stat">
          <span className="label">Realistic plan</span>
          <strong>{money(fit.baseTotal)}</strong>
          <small>
            Typical months plus a {money(cushion.amount)}/mo shared cushion
            {cushion.capped
              ? ". Your swings are big enough that even padding every line wouldn’t stop all the raids, so the cushion is held at that cost."
              : cushion.perLinePadding > cushion.amount + 0.5
                ? `. Padding each line for its own bad months would take ${money(cushion.perLinePadding)}.`
                : "."}
          </small>
        </div>
        <div className={`fit-stat ${fit.stillOver > 0 ? "negative" : ""}`}>
          <span className="label">Fit plan</span>
          <strong>{money(fit.total)}</strong>
          <small>
            {takeHome === null
              ? "Enter your income to fit the plan to it."
              : fit.gap === 0
                ? `Fits your income with ${money(takeHome - fit.total)} left.`
                : fit.stillOver > 0
                  ? `Still ${money(fit.stillOver)} over after every flexible line is at its floor and the cushion is gone. That gap needs a choice on an essential or more income.`
                  : `Trims ${money(fit.flexibleCut)} from flexible lines${fit.cushionCut ? ` and ${money(fit.cushionCut)} from the cushion` : ""} to fit. Those trims only hold if you spend less than last year.`}
          </small>
        </div>
        <div className="fit-stat">
          <span className="label">
            Moving money to cover overspending, last {fitScore.months} months
          </span>
          <ScoreLine label="Your plan" score={yourScore} />
          <ScoreLine label="Fit plan" score={fitScore} />
          {fit.flexibleCut > 0 && (
            <small>
              The replay uses last year’s spending, so trimmed lines show up as
              shortfalls until your spending actually changes.
            </small>
          )}
        </div>
      </div>
      {(shorts.length > 0 || rollover.total > 0) && (
        <div className="fit-notes">
          {shorts.length > 0 && (
            <p>
              With your plan, shortfalls mostly hit{" "}
              {shorts
                .map((s) => `${name(s.id)} (${times(s.shortMonths)})`)
                .join(", ")}
              {donors.length
                ? `, usually covered from ${donors.map((d) => name(d.id)).join(", ")}.`
                : "."}
            </p>
          )}
          {rollover.total > 0 && (
            <p>
              Right now {money(rollover.total)} sits in flexible lines beyond a
              typical month (
              {rollover.lines
                .slice(0, 3)
                .map((l) => `${name(l.id)} ${money(l.surplus)}`)
                .join(", ")}
              {rollover.lines.length > 3 ? ", …" : ""}). You can use it to cover
              a gap this month without zeroing anything. It isn’t a reason to
              lower the ongoing amounts, since it runs out once spent.
            </p>
          )}
        </div>
      )}
      <div className="fit-columns">
        <div>
          <h3>
            Where to add{" "}
            {addTotal > 0 && <span className="short">+{money(addTotal)}</span>}
          </h3>
          {list(adds, "Nothing to add: your plan covers your usual spending.")}
        </div>
        <div>
          <h3>
            Where to cut{" "}
            {cutTotal > 0 && (
              <span className="positive">−{money(cutTotal)}</span>
            )}
          </h3>
          {list(cuts, "Nothing to cut.")}
        </div>
      </div>
      {(adds.length > SHOWN || cuts.length > SHOWN) && (
        <button className="quiet" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : "Show every change"}
        </button>
      )}
      <div className="fit-actions">
        <div className="reserve">
          <label>Shared cushion in your plan</label>
          <div>
            <span>$ </span>
            <AmountInput
              value={cushionMonthly}
              label="Shared cushion in your plan"
              onCommit={(n) => n !== null && onCushionChange(n)}
            />
            <span className="reserve-arrow">/month</span>
            {Math.abs(cushionDelta) >= 0.5 && (
              <button
                className="apply"
                onClick={() => onCushionChange(fit.cushion)}
              >
                Use {money(fit.cushion)}
              </button>
            )}
          </div>
          <small>
            Keep it in one YNAB category and cover overspending from it first.
          </small>
        </div>
        <div className="fit-apply">
          <button className="primary" disabled={applied} onClick={onApply}>
            {applied ? "Fit plan in use" : "Use the fit plan"}
          </button>
          <small>
            Sets every ongoing line and the cushion. Your YNAB budget stays
            unchanged.
          </small>
        </div>
      </div>
    </section>
  );
}
