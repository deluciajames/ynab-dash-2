import { useEffect, useRef, useState } from "react";
import type { Category } from "../api/transform";
import {
  fundingLabels,
  monthLabel,
  normalizeMonth,
  type CategoryOverride,
  type CategoryPlan,
  type FundingType,
} from "../api/planning";
import { AmountInput } from "./AmountInput";
import { SpendingChart } from "./SpendingChart";
import { money } from "../lib/money";

interface Props {
  category: Category;
  groupName: string;
  plan: CategoryPlan;
  override: CategoryOverride;
  onChange: (change: Partial<CategoryOverride>) => void;
  onClose: () => void;
}
export function CategoryDetail({
  category,
  groupName,
  plan,
  override,
  onChange,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => {
      el?.close();
    };
  }, []);
  const excluded = (override.excludedMonths || []).map(normalizeMonth);
  const toggleMonth = (month: string) => {
    if (plan.type !== "monthly") return;
    const isExcluded = excluded.includes(month);
    if (!isExcluded && plan.includedCount <= 1) {
      setNotice(
        "Keep at least one month included to calculate a planning average.",
      );
      return;
    }
    onChange({
      excludedMonths: isExcluded
        ? excluded.filter((m) => m !== month)
        : [...excluded, month],
    });
    setNotice("");
    setHistoryOpen(true);
  };
  const actualCount = plan.history.length;
  const excludedSpending = plan.history
    .filter((m) => m.excluded)
    .reduce((s, m) => s + m.amount, 0);
  const numberField = (
    field: "billAmount" | "saved" | "expectedAnnual" | "savingsMonthly",
    label: string,
    value: number | null,
  ) => (
    <label>
      {label}
      <AmountInput
        value={value}
        label={label}
        nullable
        onCommit={(n) => onChange({ [field]: n })}
      />
    </label>
  );
  return (
    <dialog
      className="detail-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="detail-name"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <button className="quiet modalclose" onClick={onClose}>
        Close
      </button>
      <div className="eyebrow">{groupName}</div>
      <h2 id="detail-name" style={{ marginTop: 15 }}>
        {category.name}
      </h2>
      <p>See what happened, then choose how to plan for what comes next.</p>
      <div className="funding-editor">
        <label htmlFor="goal-type">How should we plan for this?</label>
        <select
          id="goal-type"
          value={plan.type}
          onChange={(e) => {
            const type = e.target.value as FundingType;
            onChange(
              type === "oneoff"
                ? { oneOff: true }
                : { fundingType: type, oneOff: false },
            );
          }}
        >
          {Object.entries(fundingLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <div className="goal-inputs">
          {plan.type === "annual" && (
            <>
              {numberField("billAmount", "Expected bill", plan.billAmount)}
              {numberField("saved", "Already set aside", plan.saved)}
              <label>
                Bill due date
                <input
                  aria-label="Bill due date"
                  type="date"
                  value={plan.dueDate}
                  onChange={(e) => onChange({ dueDate: e.target.value })}
                />
              </label>
            </>
          )}
          {plan.type === "irregular" &&
            numberField(
              "expectedAnnual",
              "Expected spending per year",
              plan.expectedAnnual,
            )}
          {plan.type === "savings" &&
            numberField(
              "savingsMonthly",
              "Your chosen monthly contribution",
              plan.savingsMonthly,
            )}
        </div>
        {plan.type === "monthly" && (
          <label className="fixed-choice">
            <input
              type="checkbox"
              checked={override.fixedBill ?? false}
              onChange={(e) => onChange({ fixedBill: e.target.checked })}
            />
            This is a known fixed bill
          </label>
        )}
        {plan.type !== "oneoff" && plan.current === null && (
          <div className="goal-inputs">
            <label>
              Current monthly contribution
              <AmountInput
                value={plan.current}
                label="Current monthly contribution"
                nullable
                onCommit={(currentMonthly) => onChange({ currentMonthly })}
              />
            </label>
          </div>
        )}
        <p>
          {plan.type === "annual" &&
          plan.billAmount !== null &&
          plan.saved !== null &&
          plan.deposits &&
          plan.deposits > 0
            ? `(${money(plan.billAmount)} expected bill − ${money(plan.saved)} already credited) ÷ ${plan.deposits} remaining monthly deposits = ${money(plan.need ?? 0)}/month. Assumes a deposit this month and before payment in the due month.`
            : plan.explanation}
        </p>
        {plan.type === "irregular" && (
          <p>
            Available in YNAB: {money(plan.availableBalance)}.{" "}
            {plan.expectedAnnual !== null
              ? `${money(plan.expectedAnnual)} per year ÷ 12 = ${money(plan.need ?? 0)}/month.`
              : "Choose an expected yearly amount."}
          </p>
        )}
        {plan.type === "annual" &&
          override.saved === undefined &&
          category.goal?.funded !== null &&
          category.goal?.funded !== undefined && (
            <p className="goal-field-hint">
              YNAB funding credited to this goal period may include amounts
              already spent. Edit it if you are planning a different future
              bill.
            </p>
          )}
      </div>
      {plan.warning && (
        <p className="detail-warning" role="status">
          {plan.warning}
        </p>
      )}
      <div className="dialogstats detail-stats">
        <div>
          Actual avg. · all {actualCount} months
          <strong>
            {plan.rawAverage === null ? "—" : money(plan.rawAverage)}
          </strong>
        </div>
        {plan.type === "monthly" && (
          <div>
            Planning avg. · {plan.includedCount} months
            <strong>{plan.average === null ? "—" : money(plan.average)}</strong>
          </div>
        )}
        <div>
          Monthly funding need
          <strong>{plan.need === null ? "Review" : money(plan.need)}</strong>
        </div>
      </div>
      <div className="chart-heading">
        <strong>Monthly spending</strong>
        <span>
          {actualCount
            ? `${monthLabel(plan.history[0].month)} – ${monthLabel(plan.history[actualCount - 1].month)}`
            : "No completed months"}
        </span>
      </div>
      <SpendingChart plan={plan} onToggle={toggleMonth} />
      <div id="chart-legend">
        <span>■ Actual monthly spending</span>
        {plan.type === "monthly" && (
          <span style={{ color: "#8a9690" }}>■ Excluded from planning</span>
        )}
        {plan.type !== "oneoff" && (
          <>
            <span style={{ color: "#a2633e" }}>– – Current</span>
            <span style={{ color: "#236d59" }}>··· Proposed</span>
          </>
        )}
      </div>
      {plan.type === "monthly" ? (
        <details
          id="planning-controls"
          open={historyOpen}
          onToggle={(e) => setHistoryOpen(e.currentTarget.open)}
        >
          <summary>
            Adjust planning history · {plan.includedCount} of {actualCount}{" "}
            months included
          </summary>
          <p className="adjust-help">
            Click a month or its bar to exclude it from planning. Click again to
            include it. Actual spending stays visible.
          </p>
          <div id="month-choices">
            {plan.history.map((m) => (
              <button
                key={m.month}
                className={`month-choice ${m.excluded ? "excluded" : ""}`}
                aria-pressed={m.excluded}
                aria-label={`${m.excluded ? "Include" : "Exclude"} ${monthLabel(m.month)} in planning`}
                onClick={() => toggleMonth(m.month)}
              >
                <span>{monthLabel(m.month, true)}</span>
                <strong>{money(m.amount)}</strong>
                <small>{m.excluded ? "Excluded" : "Included"}</small>
              </button>
            ))}
          </div>
          <p className="adjust-help" role="status">
            {notice ||
              (plan.includedCount !== actualCount
                ? `${money(excludedSpending)} in excluded spending remains in actual history. Plan for it separately if it could happen again. Excluding a month does not add money to your One-Off reserve.`
                : "No months excluded.")}
          </p>
          {plan.history
            .filter((m) => m.excluded)
            .map((m) => (
              <label className="reason-row" key={m.month}>
                {monthLabel(m.month)} · why exclude it?
                <input
                  aria-label={`Reason for excluding ${monthLabel(m.month)}`}
                  placeholder="e.g. one-time travel expense"
                  value={override.exclusionReasons?.[m.month] || ""}
                  onChange={(e) =>
                    onChange({
                      exclusionReasons: {
                        ...override.exclusionReasons,
                        [m.month]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
        </details>
      ) : (
        <p id="exclusion-unavailable">
          {plan.type === "oneoff"
            ? "Historical spending is retained; the entire category is excluded from ongoing targets."
            : "Month exclusions are for ordinary monthly spending. Annual and irregular funding use expected costs instead, so a bill month cannot silently disappear."}
        </p>
      )}
      <details className="chart-values">
        <summary>View monthly amounts</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Spending</th>
            </tr>
          </thead>
          <tbody>
            {plan.history.map((m) => (
              <tr key={m.month}>
                <td>
                  {monthLabel(m.month)}
                  {m.excluded ? " · excluded from planning" : ""}
                </td>
                <td>{money(m.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="history-note">
        {plan.type === "oneoff"
          ? `Recorded spending in the loaded history: ${money(plan.rawTotal)}. No repeat monthly allocation.`
          : "Discrepancy = current monthly contribution − monthly funding need. A positive amount is a review opportunity; money already saved for obligations remains committed."}
      </p>
      {plan.type !== "oneoff" && (
        <button
          className="apply"
          disabled={
            plan.recommendation === null ||
            plan.proposed === plan.recommendation
          }
          onClick={() =>
            plan.recommendation !== null &&
            onChange({ target: plan.recommendation })
          }
          aria-label={`Apply recommendation for ${category.name}`}
        >
          {plan.recommendation === null
            ? "Review inputs"
            : plan.proposed === plan.recommendation
              ? "Applied"
              : `Use ${money(plan.recommendation)}`}
        </button>
      )}
    </dialog>
  );
}
