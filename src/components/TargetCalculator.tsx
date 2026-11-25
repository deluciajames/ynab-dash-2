import { Fragment, useMemo, useState } from "react";
import type { Category, CategoryGroup } from "../api/transform";
import {
  totalPlan,
  type CategoryOverride,
  type CategoryPlan,
  type OverridesMap,
} from "../api/planning";
import { planChanges, type PlanChange } from "../api/fit";
import { applySortOrder } from "../hooks/useGroupSortOrder";
import { money } from "../lib/money";
import { AmountInput } from "./AmountInput";
import { FitPanel, type Planning } from "./FitPanel";

interface Props {
  categories: Category[];
  groups: CategoryGroup[];
  groupSortOrder: string[];
  overrides: OverridesMap;
  plans: Record<string, CategoryPlan>;
  onSetOverride: (id: string, change: Partial<CategoryOverride>) => void;
  onSetOverrides: (changes: Record<string, Partial<CategoryOverride>>) => void;
  onSelectCategory: (category: Category) => void;
  takeHome: number | null;
  takeHomeInput: string;
  onTakeHomeChange: (value: string) => void;
  annualReserve: number;
  onReserveChange: (value: number) => void;
  cushionMonthly: number;
  onCushionChange: (value: number) => void;
  planning: Planning;
  onReset: () => void;
  availableMonths: string[];
}
type Filter = "all" | "attention" | "need" | "room" | "unset" | "fit";
type View = "categories" | "fit" | "oneoff";
export function TargetCalculator({
  categories,
  groups,
  groupSortOrder,
  overrides,
  plans,
  onSetOverride,
  onSetOverrides,
  onSelectCategory,
  takeHome,
  takeHomeInput,
  onTakeHomeChange,
  annualReserve,
  onReserveChange,
  cushionMonthly,
  onCushionChange,
  planning,
  onReset,
  availableMonths,
}: Props) {
  const [opened, setOpened] = useState<Set<string>>(new Set()),
    [offOpened, setOffOpened] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("categories");
  const [filter, setFilter] = useState<Filter>("all"),
    [query, setQuery] = useState(""),
    [autoOpen, setAutoOpen] = useState(true),
    [notice, setNotice] = useState("");
  const expenseGroups = useMemo(
    () =>
      applySortOrder(
        groups.filter((g) => !g.isIncome),
        groupSortOrder,
      ),
    [groups, groupSortOrder],
  );
  const expenseCategories = categories.filter((c) => c.type !== "Income");
  const totals = totalPlan(
      expenseCategories.map((c) => plans[c.id]),
      annualReserve,
      cushionMonthly,
    ),
    left = takeHome === null ? null : takeHome - totals.total;
  const confirmed = totals.missingTargets === 0 && takeHome !== null,
    over = confirmed && left !== null && left < 0;
  const filtering = query.trim() !== "" || filter !== "all";
  const kind = (p: CategoryPlan) =>
    p.need === null
      ? "need"
      : p.discrepancy! < -0.5
        ? "need"
        : p.discrepancy! > Math.max(5, p.current * 0.2)
          ? "room"
          : "steady";
  const { adds, cuts } = useMemo(
    () => planChanges(planning.fit, plans),
    [planning.fit, plans],
  );
  const changeById = useMemo(
    () => new Map<string, PlanChange>([...adds, ...cuts].map((c) => [c.id, c])),
    [adds, cuts],
  );
  const inFilter = (c: Category, f: Filter) => {
    const p = plans[c.id];
    return f === "all"
      ? true
      : f === "attention"
        ? ["need", "room"].includes(kind(p))
        : f === "unset"
          ? !p.currentSet
          : f === "fit"
            ? changeById.has(c.id)
            : kind(p) === f;
  };
  const matches = (c: Category, g: CategoryGroup) =>
    (c.name + " " + g.name)
      .toLowerCase()
      .includes(query.trim().toLowerCase()) && inFilter(c, filter);
  const ongoing = expenseCategories.filter(
      (c) => plans[c.id].type !== "oneoff",
    ),
    oneOff = expenseCategories.filter((c) => plans[c.id].type === "oneoff");
  const listed = expenseGroups
    .map((g) => ({ g, active: ongoing.filter((c) => c.groupId === g.id) }))
    .map((x) => ({ ...x, shown: x.active.filter((c) => matches(c, x.g)) }))
    .filter((x) => x.shown.length);
  const toggle = (id: string, off = false) => {
    if (off) {
      setOffOpened((old) => {
        const next = new Set(old);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      return;
    }
    const base =
      filtering && autoOpen
        ? new Set(listed.map((x) => x.g.id))
        : new Set(opened);
    base.has(id) ? base.delete(id) : base.add(id);
    setOpened(base);
    setAutoOpen(false);
  };
  const mark = (cs: Category[], oneOffValue: boolean) => {
    onSetOverrides(
      Object.fromEntries(
        cs.map((c) => [
          c.id,
          {
            oneOff: oneOffValue,
            ...(!oneOffValue && overrides[c.id]?.fundingType === "oneoff"
              ? { fundingType: "monthly" as const }
              : {}),
          },
        ]),
      ),
    );
    if (oneOffValue)
      setOffOpened((old) => new Set([...old, ...cs.map((c) => c.groupId)]));
    else setOpened((old) => new Set([...old, ...cs.map((c) => c.groupId)]));
    setNotice(
      `${cs.length === 1 ? cs[0].name : `${cs.length} categories`} ${oneOffValue ? "moved to One-Off. History is preserved." : "returned to the ongoing plan."}`,
    );
  };
  const planAs = (cs: Category[], label: string) => {
    const off = cs.filter((c) => plans[c.id].type === "oneoff").length,
      value = off === cs.length ? "oneoff" : off ? "mixed" : "ongoing";
    return (
      <select
        className="plan-type"
        aria-label={`Plan type for ${label}`}
        value={value}
        onChange={(e) => {
          if (e.target.value !== "mixed") mark(cs, e.target.value === "oneoff");
        }}
      >
        {value === "mixed" && <option value="mixed">Mixed</option>}
        <option value="ongoing">Ongoing</option>
        <option value="oneoff">One-off</option>
      </select>
    );
  };
  // The suggestion is the line's amount in the fit plan: its typical month,
  // trimmed only if the whole plan has to come down to fit income.
  const suggestion = (c: Category) =>
    plans[c.id].type === "oneoff" || plans[c.id].recommendation === null
      ? null
      : (planning.fit.byId[c.id]?.amount ?? plans[c.id].recommendation);
  const apply = (cs: Category[]) => {
    const eligible = cs.filter((c) => suggestion(c) !== null);
    onSetOverrides(
      Object.fromEntries(
        eligible.map((c) => [c.id, { target: suggestion(c)! }]),
      ),
    );
    setNotice(
      `Suggestions applied to ${eligible.length} ${eligible.length === 1 ? "category" : "categories"}. Your YNAB budget stays unchanged.`,
    );
  };
  const applyButton = (c: Category) => {
    const p = plans[c.id],
      amount = suggestion(c),
      line = planning.fit.byId[c.id],
      trimmed = amount !== null && !!line && line.cut > 0,
      done = amount === p.proposed;
    return amount === null ? (
      <span className="pending">Review inputs</span>
    ) : (
      <button
        className="apply"
        disabled={done}
        aria-label={`Apply recommendation for ${c.name}`}
        title={
          trimmed
            ? `Trimmed from ${money(line!.base)} to fit your income`
            : undefined
        }
        onClick={() => onSetOverride(c.id, { target: amount })}
      >
        {done ? "Applied" : `Use ${money(amount)}`}
        {trimmed && !done ? " · trimmed" : ""}
      </button>
    );
  };
  const groupTotals = (cs: Category[]) => {
    const values = cs.map((c) => plans[c.id]),
      need = values.every((p) => p.need !== null)
        ? values.reduce((s, p) => s + p.need!, 0)
        : null;
    const current = values.every((p) => p.current !== null)
      ? values.reduce((s, p) => s + p.current!, 0)
      : null;
    const proposed = values.every((p) => p.proposed !== null)
      ? values.reduce((s, p) => s + p.proposed!, 0)
      : null;
    return { need, current, proposed };
  };
  const applyFitPlan = () => {
    apply(ongoing);
    onCushionChange(planning.fit.cushion);
    setNotice(
      "Fit plan applied to every ongoing line and the shared cushion. Your YNAB budget stays unchanged.",
    );
  };
  const fitReason = (c: PlanChange) =>
    c.reason === "usual"
      ? `you usually spend about ${money(plans[c.id]?.need ?? c.to)}`
      : c.reason === "padding"
        ? "above what you usually spend"
        : `below your usual ${money(plans[c.id]?.need ?? 0)}: a spending change`;
  const fitNote = (id: string) => {
    const c = changeById.get(id);
    if (!c) return null;
    return (
      <small className={`fit-note ${c.delta > 0 ? "short" : "positive"}`}>
        {c.delta > 0 ? "+" : "−"}
        {money(Math.abs(c.delta))} · {money(c.from)} → {money(c.to)} ·{" "}
        {fitReason(c)}
      </small>
    );
  };
  const fitStrip = () => {
    const addTotal = adds.reduce((s, c) => s + c.delta, 0),
      cutTotal = cuts.reduce((s, c) => s - c.delta, 0),
      cushionDelta = planning.fit.cushion - cushionMonthly,
      applied = !adds.length && !cuts.length && Math.abs(cushionDelta) < 0.5;
    return (
      <div className="filter-strip">
        <div>
          <strong>
            {adds.length} to add{" "}
            {addTotal > 0 && <span className="short">+{money(addTotal)}</span>}{" "}
            · {cuts.length} to trim{" "}
            {cutTotal > 0 && (
              <span className="positive">−{money(cutTotal)}</span>
            )}
            {Math.abs(cushionDelta) >= 0.5 &&
              ` · cushion ${money(cushionMonthly)} → ${money(planning.fit.cushion)}/mo`}
          </strong>
          <small>
            Each line shows what the fit plan changes. Use a line’s suggestion,
            or the whole plan at once.{" "}
            <button className="linklike" onClick={() => setView("fit")}>
              See how the fit plan works
            </button>
          </small>
        </div>
        <button className="primary" disabled={applied} onClick={applyFitPlan}>
          {applied ? "Fit plan in use" : "Use the fit plan"}
        </button>
      </div>
    );
  };
  const unsetStrip = () => {
    const unset = ongoing.filter((c) => !plans[c.id].currentSet),
      spends = unset.filter((c) => (plans[c.id].need ?? 0) > 0),
      need = spends.reduce((s, c) => s + plans[c.id].need!, 0);
    return (
      <div className="filter-strip warning-notice">
        <div>
          <strong>
            {unset.length}{" "}
            {unset.length === 1 ? "category has" : "categories have"} no YNAB
            target
            {spends.length > 0 &&
              ` · ${spends.length === unset.length ? (unset.length === 1 ? "it needs" : "together they need") : `${spends.length} of them need${spends.length === 1 ? "s" : ""}`} about ${money(need)}/mo`}
          </strong>
          <small>
            With no target, nothing is set aside for them, so their spending
            gets covered by pulling from other categories. Set a target in YNAB,
            or choose One-off if it won’t happen again.
          </small>
        </div>
      </div>
    );
  };
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">Your monthly plan</div>
          <h1>A clear view. A balanced plan.</h1>
          <p>Everyday spending, future goals, and life’s one-off expenses.</p>
        </div>
        <div className="quiet last-window">
          Last {availableMonths.length} completed months
        </div>
      </div>
      <div className="summary">
        <section className="card">
          <label htmlFor="income">Monthly take-home income</label>
          <div className="amount">
            <span className="currency-sign">$</span>
            <input
              id="income"
              className="income"
              type="number"
              min="0"
              step="any"
              value={takeHomeInput}
              onChange={(e) => onTakeHomeChange(e.target.value)}
              placeholder="0"
            />
          </div>
          <small>Your confirmed planning amount · editable</small>
        </section>
        <section className="card">
          <div className="label">Your monthly plan</div>
          <div id="total" className="amount">
            {totals.missingTargets ? "At least " : ""}
            {money(totals.total)}
          </div>
          <small>
            Includes {money(cushionMonthly)}/mo shared cushion and{" "}
            {money(annualReserve / 12)}/mo One-Off reserve
          </small>
        </section>
        <section className={`card room ${over ? "negative" : ""}`}>
          <div className="label">
            {totals.missingTargets
              ? "Plan incomplete"
              : takeHome === null
                ? "Income needed"
                : over
                  ? "Over your income"
                  : "Left to assign"}
          </div>
          <div id="remaining" className="amount" aria-live="polite">
            {confirmed && left !== null ? money(Math.abs(left)) : "—"}
          </div>
          <small>
            {totals.missingTargets
              ? `${totals.missingTargets} targets need review`
              : takeHome === null
                ? "Enter income to check the plan"
                : over
                  ? "Reduce your plan"
                  : "Includes reserves and savings"}
          </small>
          <div className="meter">
            <span
              style={{
                width: confirmed
                  ? `${takeHome! > 0 ? Math.min(100, (totals.total / takeHome!) * 100) : 100}%`
                  : "0%",
              }}
            />
          </div>
        </section>
      </div>
      <div
        className={`notice ${totals.missingTargets ? "warning-notice" : ""}`}
      >
        <span>
          {totals.missingTargets ? (
            `${totals.missingTargets} categories have no monthly contribution yet. Set an amount in your plan or review their suggestion before treating this plan as complete.`
          ) : (
            <>
              Choose <b>One-off</b> on a category or group to remove its ongoing
              allocation. History stays intact.
            </>
          )}
        </span>
      </div>
      <nav className="subtabs" role="tablist" aria-label="Plan sections">
        {(
          [
            ["categories", "Categories", ongoing.length],
            ["fit", "Fit to your income", adds.length + cuts.length],
            ["oneoff", "One-Off", oneOff.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            className={view === key ? "active" : ""}
            onClick={() => setView(key)}
          >
            {label}
            <span className="tabcount" aria-hidden="true">
              {count}
            </span>
          </button>
        ))}
      </nav>
      {view === "fit" && (
        <FitPanel
          planning={planning}
          categories={expenseCategories}
          plans={plans}
          takeHome={takeHome}
          cushionMonthly={cushionMonthly}
          onCushionChange={onCushionChange}
          onSelectCategory={onSelectCategory}
          onApply={applyFitPlan}
        />
      )}
      {view === "categories" && (
        <>
          <div className="toolbar">
            <h2>Ongoing category groups</h2>
            <div className="filters" aria-label="Filter categories">
              {(
                [
                  ["all", "All"],
                  ["attention", "Needs attention"],
                  ["need", "Needs more"],
                  ["room", "Room to reduce"],
                  ["unset", "No target set"],
                  ["fit", "Fit to your income"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={filter === key ? "active" : ""}
                  aria-pressed={filter === key}
                  onClick={() => {
                    setFilter(key);
                    setAutoOpen(true);
                  }}
                >
                  {label}
                  {key !== "all" && (
                    <span className="filtercount" aria-hidden="true">
                      {ongoing.filter((c) => inFilter(c, key)).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="controls">
            <input
              className="search"
              type="search"
              aria-label="Search categories or groups"
              placeholder="Find a category or group…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setAutoOpen(true);
              }}
            />
            <button
              className="quiet"
              onClick={() => {
                setOpened(new Set());
                setAutoOpen(false);
              }}
            >
              Collapse all
            </button>
            <button
              className="quiet"
              onClick={() => {
                setOpened(new Set(listed.map((x) => x.g.id)));
                setAutoOpen(false);
              }}
            >
              Expand shown groups
            </button>
            <span className="counts">
              {listed.length} {listed.length === 1 ? "group" : "groups"} ·{" "}
              {listed.reduce((s, x) => s + x.shown.length, 0)} of{" "}
              {ongoing.length} ongoing categories
            </span>
          </div>
          {filter === "unset" && unsetStrip()}
          {filter === "fit" && fitStrip()}
          <div className="tablebox">
            <table>
              <thead>
                <tr>
                  {[
                    ["Group / category", ""],
                    [
                      "Estimated need",
                      "What this category needs each month, from its spending history or its bill and savings inputs",
                    ],
                    [
                      "YNAB target",
                      "Your current YNAB target as a monthly amount",
                    ],
                    [
                      "Target vs. need",
                      "YNAB target minus estimated need. Negative means the target is short.",
                    ],
                    [
                      "Your plan",
                      "Your sandbox amount. It starts at the YNAB target and never changes YNAB.",
                    ],
                    [
                      "Suggestion",
                      "The line's amount in the fit plan: estimated need rounded up to $5, trimmed only if the plan has to fit your income",
                    ],
                    [
                      "Plan as",
                      "Ongoing categories get a monthly plan; one-off ones do not",
                    ],
                  ].map(([label, help]) => (
                    <th scope="col" key={label} title={help || undefined}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listed.map(({ g, active, shown }) => {
                  const t = groupTotals(active),
                    expanded = (filtering && autoOpen) || opened.has(g.id),
                    eligible = active.filter((c) => suggestion(c) !== null),
                    done = eligible.every(
                      (c) => suggestion(c) === plans[c.id].proposed,
                    );
                  return (
                    <Fragment key={g.id}>
                      <tr className="group">
                        <td>
                          <button
                            className="groupbutton"
                            onClick={() => toggle(g.id)}
                            aria-expanded={expanded}
                            aria-label={`Toggle ${g.name}`}
                          >
                            <span className="chevron">
                              {expanded ? "▾" : "▸"}
                            </span>
                            <span>
                              {g.name}{" "}
                              <span className="groupmeta">{active.length}</span>
                            </span>
                          </button>
                        </td>
                        <td>{t.need === null ? "Review" : money(t.need)}</td>
                        <td>
                          {t.current === null ? "Not set" : money(t.current)}
                        </td>
                        <td>
                          {t.current === null || t.need === null
                            ? "—"
                            : money(t.current - t.need)}
                        </td>
                        <td>
                          {t.proposed === null
                            ? "Incomplete"
                            : money(t.proposed)}
                        </td>
                        <td>
                          {eligible.length ? (
                            <button
                              className="apply"
                              disabled={done}
                              aria-label={`Apply recommendations for ${g.name}`}
                              title="Applies to all ongoing categories in this group, including those hidden by filters"
                              onClick={() => apply(active)}
                            >
                              {done ? "Applied" : "Use suggestions"}
                            </button>
                          ) : (
                            <span className="pending">Review inputs</span>
                          )}
                        </td>
                        <td>
                          {planAs(
                            expenseCategories.filter((c) => c.groupId === g.id),
                            g.name,
                          )}
                        </td>
                      </tr>
                      {expanded &&
                        shown.map((c) => {
                          const p = plans[c.id],
                            k = kind(p);
                          return (
                            <tr key={c.id} className="category">
                              <td>
                                <button
                                  className="category-name"
                                  onClick={() => onSelectCategory(c)}
                                >
                                  {c.name}
                                </button>
                                <span
                                  className={`purpose ${p.type}`}
                                  title="Open category to change its purpose"
                                >
                                  {p.type === "annual"
                                    ? "Annual"
                                    : p.type === "irregular"
                                      ? "Irregular"
                                      : p.type === "savings"
                                        ? "Savings"
                                        : "Monthly"}
                                </span>
                                <button
                                  className={`priority ${p.priority}`}
                                  aria-label={`${c.name} is ${p.priority}. Switch to ${p.priority === "flexible" ? "essential" : "flexible"}`}
                                  title={
                                    p.priority === "flexible"
                                      ? `Flexible: can be trimmed to fit income, down to ${money(p.floor)}. Click to mark essential.`
                                      : "Essential: never trimmed to fit income. Click to mark flexible."
                                  }
                                  onClick={() =>
                                    onSetOverride(c.id, {
                                      priority:
                                        p.priority === "flexible"
                                          ? "essential"
                                          : "flexible",
                                    })
                                  }
                                >
                                  {p.priority === "flexible"
                                    ? "Flexible"
                                    : "Essential"}
                                </button>
                                {filter === "fit" && fitNote(c.id)}
                              </td>
                              <td>
                                {p.need === null ? "Review" : money(p.need)}
                                <small className="method">{p.method}</small>
                              </td>
                              <td>
                                {!p.currentSet ? (
                                  <button
                                    className="category-name inline-setup"
                                    onClick={() => onSelectCategory(c)}
                                    title="No YNAB target or entered amount; counted as $0"
                                  >
                                    {money(0)} · not set
                                  </button>
                                ) : (
                                  money(p.current)
                                )}
                              </td>
                              <td
                                className={
                                  k === "need"
                                    ? "short"
                                    : k === "room"
                                      ? "positive"
                                      : ""
                                }
                              >
                                {p.discrepancy === null
                                  ? "—"
                                  : `${p.discrepancy > 0 ? "+" : ""}${money(p.discrepancy)}`}
                              </td>
                              <td>
                                <span aria-hidden="true">$ </span>
                                <AmountInput
                                  className="target"
                                  value={p.proposed}
                                  label={`Your monthly plan for ${c.name}`}
                                  onCommit={(n) =>
                                    n !== null &&
                                    onSetOverride(c.id, { target: n })
                                  }
                                />
                              </td>
                              <td>{applyButton(c)}</td>
                              <td>{planAs([c], c.name)}</td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
                {!listed.length && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: "center", padding: 25 }}
                    >
                      {filter === "unset" && !query.trim()
                        ? "Every ongoing category has a target. Nice."
                        : filter === "fit" && !query.trim()
                          ? "Your plan already matches the fit plan."
                          : "No ongoing categories match. Check the One-Off tab or change your search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="caption">
            All amounts are per month. Estimated need follows each category’s
            purpose; target vs. need = YNAB target − estimated need. Your plan
            is a sandbox that never changes YNAB. Positive amounts warrant
            review; annual obligations and reserves still need funding. Group
            totals include categories hidden by filters.
          </p>
        </>
      )}
      {view === "oneoff" && (
        <section className="oneoff-section">
          <div className="oneoff-heading">
            <div>
              <div className="eyebrow">Life happens</div>
              <h2>One-Off</h2>
              <p>
                Different big expenses each year. One shared reserve for the
                unknown.
              </p>
            </div>
            <div className="reserve">
              <label>Choose your yearly reserve</label>
              <div>
                <span>$ </span>
                <AmountInput
                  value={annualReserve}
                  label="Choose your yearly reserve"
                  onCommit={(n) => n !== null && onReserveChange(n)}
                />
                <span className="reserve-arrow">→</span>
                <strong>{money(annualReserve / 12)}/month</strong>
              </div>
              <small>
                Included once in your monthly plan · saved steadily year-round
              </small>
            </div>
          </div>
          <div className="controls">
            <input
              className="search"
              type="search"
              aria-label="Search one-off categories or groups"
              placeholder="Find a category or group…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="counts">
              {oneOff.length} historical categories · excluded from ongoing
              targets
            </span>
          </div>
          <div className="off-table">
            <table>
              <thead>
                <tr>
                  {[
                    "Original group / category",
                    "Recorded spending",
                    "Ongoing allocation",
                    "Plan as",
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenseGroups.map((g) => {
                  const cs = oneOff.filter((c) => c.groupId === g.id),
                    shown = cs.filter((c) =>
                      (c.name + " " + g.name)
                        .toLowerCase()
                        .includes(query.trim().toLowerCase()),
                    );
                  if (!shown.length) return null;
                  const expanded = offOpened.has(g.id) || query.trim() !== "";
                  return (
                    <Fragment key={g.id}>
                      <tr className="group">
                        <td>
                          <button
                            className="groupbutton"
                            onClick={() => toggle(g.id, true)}
                            aria-expanded={expanded}
                            aria-label={`Toggle one-off ${g.name}`}
                          >
                            <span className="chevron">
                              {expanded ? "▾" : "▸"}
                            </span>
                            {g.name}{" "}
                            <span className="groupmeta">{cs.length}</span>
                          </button>
                        </td>
                        <td>
                          {money(
                            cs.reduce((s, c) => s + plans[c.id].rawTotal, 0),
                          )}
                        </td>
                        <td>No repeat allocation</td>
                        <td>
                          {planAs(
                            expenseCategories.filter((c) => c.groupId === g.id),
                            g.name,
                          )}
                        </td>
                      </tr>
                      {expanded &&
                        shown.map((c) => (
                          <tr key={c.id} className="category">
                            <td>
                              <button
                                className="category-name"
                                onClick={() => onSelectCategory(c)}
                              >
                                {c.name}
                              </button>
                              {c.hidden && (
                                <small>
                                  Hidden in YNAB · review classification
                                </small>
                              )}
                            </td>
                            <td>{money(plans[c.id].rawTotal)}</td>
                            <td>Excluded</td>
                            <td>{planAs([c], c.name)}</td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
                {!oneOff.some((c) =>
                  (
                    c.name +
                    " " +
                    (groups.find((g) => g.id === c.groupId)?.name || "")
                  )
                    .toLowerCase()
                    .includes(query.trim().toLowerCase()),
                ) && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: 18, textAlign: "center" }}
                    >
                      {oneOff.length
                        ? "No one-off categories match your search."
                        : "Choose One-off on a category or group in the Categories tab to keep it out of ongoing targets."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="caption">
            These past events don’t get repeated monthly targets. The reserve is
            your choice—not a prediction from one unusual year. Recorded
            spending covers the loaded completed months; older expenses may be
            outside that window.
          </p>
        </section>
      )}
      <div className="footer">
        <div>
          <strong>
            {totals.missingTargets
              ? `Set ${totals.missingTargets} missing targets to check this plan.`
              : takeHome === null
                ? "Enter income to check your plan."
                : over
                  ? `Your plan is ${money(Math.abs(left!))} over your income. The Fit to your income tab shows which lines to trim.`
                  : `Your plan fits, with ${money(left!)} left.`}
          </strong>
          <p>Try changes here. Your YNAB budget stays unchanged.</p>
        </div>
        <button
          className="quiet"
          onClick={() => {
            onReset();
            setNotice(
              "Your plan is reset to your YNAB targets with no shared cushion. Category purposes, essential or flexible choices, exclusions and reserve are preserved.",
            );
          }}
        >
          Reset your plan
        </button>
      </div>
      <p className="caption" role="status" aria-live="polite">
        {notice}
      </p>
      <p className="caption">
        Click a category name for details, or Flexible / Essential to change
        whether it can be trimmed. Your plan is saved to your account for the
        selected budget.
      </p>
    </>
  );
}
