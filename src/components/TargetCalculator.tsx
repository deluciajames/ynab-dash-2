import { Fragment, useMemo, useState } from "react";
import type { Category, CategoryGroup } from "../api/transform";
import {
  totalPlan,
  type CategoryOverride,
  type CategoryPlan,
  type OverridesMap,
} from "../api/planning";
import { applySortOrder } from "../hooks/useGroupSortOrder";
import { money } from "../lib/money";
import { AmountInput } from "./AmountInput";

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
  onReset: () => void;
  availableMonths: string[];
}
type Filter = "all" | "attention" | "need" | "room";
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
  onReset,
  availableMonths,
}: Props) {
  const [opened, setOpened] = useState<Set<string>>(new Set()),
    [offOpened, setOffOpened] = useState<Set<string>>(new Set());
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
    ),
    left = takeHome === null ? null : takeHome - totals.total;
  const confirmed = totals.missingTargets === 0 && takeHome !== null,
    over = confirmed && left !== null && left < 0;
  const filtering = query.trim() !== "" || filter !== "all";
  const kind = (p: CategoryPlan) =>
    p.current === null || p.need === null
      ? "need"
      : p.discrepancy! < -0.5
        ? "need"
        : p.discrepancy! > Math.max(5, p.current * 0.2)
          ? "room"
          : "steady";
  const matches = (c: Category, g: CategoryGroup) => {
    if (
      !(c.name + " " + g.name)
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    )
      return false;
    return (
      filter === "all" ||
      (filter === "attention" &&
        ["need", "room"].includes(kind(plans[c.id]))) ||
      kind(plans[c.id]) === filter
    );
  };
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
  const apply = (cs: Category[]) => {
    const eligible = cs.filter(
      (c) =>
        plans[c.id].recommendation !== null && plans[c.id].type !== "oneoff",
    );
    onSetOverrides(
      Object.fromEntries(
        eligible.map((c) => [c.id, { target: plans[c.id].recommendation! }]),
      ),
    );
    setNotice(
      `Suggestions applied to ${eligible.length} ${eligible.length === 1 ? "category" : "categories"}. Your YNAB budget stays unchanged.`,
    );
  };
  const applyButton = (c: Category) => {
    const p = plans[c.id],
      done = p.recommendation === p.proposed;
    return p.recommendation === null ? (
      <span className="pending">Review inputs</span>
    ) : (
      <button
        className="apply"
        disabled={done}
        aria-label={`Apply recommendation for ${c.name}`}
        onClick={() => onSetOverride(c.id, { target: p.recommendation! })}
      >
        {done ? "Applied" : `Use ${money(p.recommendation)}`}
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
          <div className="label">Proposed monthly plan</div>
          <div id="total" className="amount">
            {totals.missingTargets ? "At least " : ""}
            {money(totals.total)}
          </div>
          <small>
            Includes {money(annualReserve / 12)}/mo for the unexpected
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
                  ? "Reduce your proposed contributions"
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
            `${totals.missingTargets} categories have no monthly contribution yet. Set a proposed amount or review their recommendation before treating this plan as complete.`
          ) : (
            <>
              Choose <b>One-off</b> on a category or group to remove its ongoing
              allocation. History stays intact.
            </>
          )}
        </span>
      </div>
      <div className="toolbar">
        <h2>Ongoing category groups</h2>
        <div className="filters" aria-label="Filter categories">
          {(
            [
              ["all", "All"],
              ["attention", "Needs attention"],
              ["need", "Needs more"],
              ["room", "Room to reduce"],
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
          {listed.length} groups ·{" "}
          {listed.reduce((s, x) => s + x.shown.length, 0)} of {ongoing.length}{" "}
          ongoing categories
        </span>
      </div>
      <div className="tablebox">
        <table>
          <thead>
            <tr>
              {[
                "Group / category",
                "Monthly need",
                "Current / mo",
                "Discrepancy",
                "Proposed / mo",
                "Recommendation",
                "Plan as",
              ].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {listed.map(({ g, active, shown }) => {
              const t = groupTotals(active),
                expanded = (filtering && autoOpen) || opened.has(g.id),
                eligible = active.filter(
                  (c) => plans[c.id].recommendation !== null,
                ),
                done = eligible.every(
                  (c) => plans[c.id].recommendation === plans[c.id].proposed,
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
                        <span className="chevron">{expanded ? "▾" : "▸"}</span>
                        <span>
                          {g.name}{" "}
                          <span className="groupmeta">{active.length}</span>
                        </span>
                      </button>
                    </td>
                    <td>{t.need === null ? "Review" : money(t.need)}</td>
                    <td>{t.current === null ? "Not set" : money(t.current)}</td>
                    <td>
                      {t.current === null || t.need === null
                        ? "—"
                        : money(t.current - t.need)}
                    </td>
                    <td>
                      {t.proposed === null ? "Incomplete" : money(t.proposed)}
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
                          </td>
                          <td>
                            {p.need === null ? "Review" : money(p.need)}
                            <small className="method">{p.method}</small>
                          </td>
                          <td>
                            {p.current === null ? (
                              <button
                                className="category-name inline-setup"
                                onClick={() => onSelectCategory(c)}
                              >
                                Not set
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
                              label={`Proposed monthly contribution for ${c.name}`}
                              onCommit={(n) =>
                                n !== null && onSetOverride(c.id, { target: n })
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
                <td colSpan={7} style={{ textAlign: "center", padding: 25 }}>
                  No ongoing categories match. Check One-Off below or change
                  your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="caption">
        Monthly need uses the category’s purpose. Discrepancy = current
        contribution − monthly need. Positive amounts warrant review; annual
        obligations and reserves still need funding. Group totals include
        categories hidden by filters.
      </p>
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
        <p className="off-caption">
          {oneOff.length} historical categories · excluded from ongoing targets
        </p>
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
                  <td colSpan={4} style={{ padding: 18, textAlign: "center" }}>
                    Mark a category or group as One-off above to keep it out of
                    ongoing targets.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="caption">
          These past events don’t get repeated monthly targets. The reserve is
          your choice—not a prediction from one unusual year. Recorded spending
          covers the loaded completed months; older expenses may be outside that
          window.
        </p>
      </section>
      <div className="footer">
        <div>
          <strong>
            {totals.missingTargets
              ? `Set ${totals.missingTargets} missing targets to check this plan.`
              : takeHome === null
                ? "Enter income to check your plan."
                : over
                  ? `Reduce this plan by ${money(Math.abs(left!))} to fit your income.`
                  : `Your proposed plan fits, with ${money(left!)} left.`}
          </strong>
          <p>Try changes here. Your YNAB budget stays unchanged.</p>
        </div>
        <button
          className="quiet"
          onClick={() => {
            onReset();
            setNotice(
              "Proposed targets reset. Your category purposes, exclusions and reserve are preserved.",
            );
          }}
        >
          Reset proposed targets
        </button>
      </div>
      <p className="caption" role="status" aria-live="polite">
        {notice}
      </p>
      <p className="caption">
        Click a category name for details. Your plan is saved in this browser
        for the selected budget.
      </p>
    </>
  );
}
