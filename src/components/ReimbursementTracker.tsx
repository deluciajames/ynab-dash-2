import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { Category } from "../api/transform";
import { chartScale } from "../api/planning";
import {
  allocationProblem,
  daysSince,
  proposeAllocations,
  type LedgerRow,
  type WashMonth,
} from "../api/reimbursements";
import type { Reimbursements } from "../hooks/useReimbursements";
import { money } from "../lib/money";

const cents = (value: number) => money(value / 100, 2);
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const pairKey = (a: { outflowId: string; inflowId: string }) =>
  `${a.outflowId}|${a.inflowId}`;

function Labels({ row }: { row: LedgerRow }) {
  return (
    <>
      {row.kind === "refund" && <span className="reimb-label">Refund or credit</span>}
      {row.kind === "payment" && <span className="reimb-label">Payment</span>}
      {row.parentId && <span className="reimb-label">Split</span>}
      {row.pending && <span className="reimb-label pending">Pending</span>}
    </>
  );
}

function Age({ date }: { date: string }) {
  const days = daysSince(date);
  return (
    <span
      className={`reimb-age ${days > 90 ? "old" : days > 30 ? "aging" : ""}`}
    >
      {days} {days === 1 ? "day" : "days"}
    </span>
  );
}

function WashChart({ series }: { series: WashMonth[] }) {
  // Draw at the real width so labels keep a readable size on every screen.
  const ref = useRef<SVGSVGElement>(null),
    [w, setW] = useState(680);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setW(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const h = 200,
    left = 62,
    top = 16,
    bottom = 30,
    cw = w - left - 16,
    ch = h - top - bottom;
  const peak = Math.max(0, ...series.map((m) => (m.owed + m.givenAway) / 100));
  const { max, step } = chartScale(peak || 100);
  const ys = (v: number) => top + ch * (1 - v / max),
    bw = cw / Math.max(1, series.length);
  const label = (month: string, long = false) =>
    new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", {
      month: long ? "long" : "short",
      year: long ? "numeric" : undefined,
    });
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Amount still owed and given away at the end of each month"
    >
      {Array.from({ length: Math.round(max / step) + 1 }, (_, i) => (
        <g key={i}>
          <line
            x1={left}
            x2={w - 16}
            y1={ys(i * step)}
            y2={ys(i * step)}
            stroke="#dde4df"
          />
          <text
            x={left - 8}
            y={ys(i * step) + 4}
            textAnchor="end"
            fontSize={10}
            fill="#60716f"
          >
            {money(i * step)}
          </text>
        </g>
      ))}
      {series.map((m, i) => {
        const owed = m.owed / 100,
          given = m.givenAway / 100,
          bwidth = Math.min(bw * 0.6, 56),
          x = left + i * bw + (bw - bwidth) / 2;
        return (
          <g key={m.month}>
            <title>
              {label(m.month, true)}: {cents(m.owed)} still owed,{" "}
              {cents(m.givenAway)} given away
            </title>
            <rect
              x={x}
              y={ys(owed)}
              width={bwidth}
              height={ys(0) - ys(owed)}
              fill="#236d59"
            />
            <rect
              x={x}
              y={ys(owed + given)}
              width={bwidth}
              height={ys(owed) - ys(owed + given)}
              fill="#b9c2bd"
            />
            <text
              x={x + bwidth / 2}
              y={h - 10}
              textAnchor="middle"
              fontSize={10}
              fill="#60716f"
            >
              {label(m.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ReimbursementTracker({
  r,
  categories,
}: {
  r: Reimbursements;
  categories: Category[];
}) {
  const [selectedOut, setSelectedOut] = useState<string[]>([]),
    [selectedIn, setSelectedIn] = useState<string[]>([]),
    [edits, setEdits] = useState<Record<string, string>>({}),
    [importMessage, setImportMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const { ledger, store, category } = r;
  const openOut = ledger.outflows.filter((x) => x.remaining > 0);
  const openIn = ledger.inflows.filter((x) => x.remaining > 0);
  const pickedOut = openOut.filter((x) => selectedOut.includes(x.id)),
    pickedIn = openIn.filter((x) => selectedIn.includes(x.id));
  const proposed = proposeAllocations(pickedOut, pickedIn);
  const allocations = proposed.map((a) => {
    const edit = edits[pairKey(a)];
    return edit === undefined
      ? a
      : { ...a, amount: Math.round(Number(edit) * 100) };
  });
  const problem = allocationProblem(allocations, ledger.rows);
  const total = allocations.reduce(
    (s, a) => s + (Number.isFinite(a.amount) ? a.amount : 0),
    0,
  );
  const outTotal = pickedOut.reduce((s, x) => s + x.remaining, 0),
    inTotal = pickedIn.reduce((s, x) => s + x.remaining, 0);
  const rowById = (id: string) => ledger.rows.find((x) => x.id === id);
  const toggle = (
    id: string,
    list: string[],
    set: (next: string[]) => void,
  ) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setEdits({});
  };
  const clearSelection = () => {
    setSelectedOut([]);
    setSelectedIn([]);
    setEdits({});
  };
  const save = () => {
    if (problem) return;
    r.addMatch(allocations);
    clearSelection();
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(r.exportData(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `reimbursements-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      if (
        !window.confirm(
          "Replace the matches and ignored items saved in this browser with this backup?",
        )
      )
        return;
      const message = r.importData(value);
      setImportMessage(message ?? "Backup restored.");
      clearSelection();
    } catch {
      setImportMessage("That file could not be read.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const categoryName = category?.name ?? "your reimbursement category";
  const matchesInView = store.matches.filter((m) =>
    m.allocations.some((a) => a.outflow.date >= store.startDate),
  );
  const ignoredRows = ledger.rows.filter((x) => x.ignored);

  return (
    <section className="reimb">
      <div className="heading">
        <div>
          <div className="eyebrow">{category?.name ?? "Reimbursements"}</div>
          <h1>What you’re still owed.</h1>
          <p>
            Tick the money you paid out, then the money that came back for it.
            Matches are saved in this browser and never change YNAB.
          </p>
        </div>
      </div>
      <div className="reimb-settings">
        <label>
          Category
          <select
            value={category?.id ?? ""}
            onChange={(e) => {
              r.setCategoryId(e.target.value);
              clearSelection();
            }}
          >
            {!category && <option value="">Choose a category</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tracking since
          <input
            type="date"
            value={store.startDate}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                r.setStartDate(e.target.value);
                clearSelection();
              }
            }}
          />
        </label>
        <div className="reimb-backup">
          <button className="quiet" onClick={download}>
            <Download size={13} /> Export backup
          </button>
          <button className="quiet" onClick={() => fileInput.current?.click()}>
            <Upload size={13} /> Import backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Choose a reimbursement backup file"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </div>
      </div>
      {importMessage && (
        <p className="reimb-note" role="status">
          {importMessage}
        </p>
      )}
      {r.storageError && (
        <p className="storage-warning" role="alert">
          This browser could not save your latest matches. Export a backup
          before closing this tab.
        </p>
      )}
      {r.error && (
        <div className="storage-warning" role="alert">
          {r.error}
        </div>
      )}
      {!category && (
        <section className="empty-state">
          <h2>Choose a category</h2>
          <p>
            Pick the YNAB category you use for money you expect back, such as
            “Getting Reimbursed.”
          </p>
        </section>
      )}
      {category && !r.loaded && r.loading && (
        <section className="empty-state" role="status">
          <h2>Loading transactions…</h2>
          <p>Gathering {categoryName} activity since {longDate(store.startDate)}.</p>
        </section>
      )}
      {category && r.loaded && (
        <>
          {r.issues.length > 0 && (
            <div className="reimb-review" role="alert">
              <strong>
                {r.issues.length === 1
                  ? "1 match changed in YNAB"
                  : `${r.issues.length} matches changed in YNAB`}
              </strong>
              {r.issues.map((issue) => (
                <div key={issue.matchId} className="reimb-review-item">
                  <ul>
                    {issue.missing.map((s) => (
                      <li key={s.id}>
                        {s.payee} ({shortDate(s.date)}, {cents(s.amount)}) is no
                        longer in {categoryName}.
                      </li>
                    ))}
                    {issue.changed.map((c) => (
                      <li key={c.before.id}>
                        {c.before.payee} ({shortDate(c.before.date)}) changed
                        from {cents(c.before.amount)} to {cents(c.now.amount)}.
                      </li>
                    ))}
                  </ul>
                  <div className="reimb-review-actions">
                    <button className="quiet" onClick={() => r.keepRest(issue)}>
                      Keep the rest of the match
                    </button>
                    <button
                      className="quiet"
                      onClick={() => r.undoMatch(issue.matchId)}
                    >
                      Undo whole match
                    </button>
                  </div>
                </div>
              ))}
              <p>
                Amounts tied to these transactions are back to open until you
                choose.
              </p>
            </div>
          )}

          <div className="reimb-summary">
            <div className="card">
              <span className="label">Still owed</span>
              <div className="amount" id="reimb-owed">
                {cents(ledger.totals.owed)}
              </div>
              <small>
                {ledger.totals.openCount} open
                {ledger.totals.oldest
                  ? ` · oldest ${daysSince(ledger.totals.oldest)} days`
                  : ""}
              </small>
            </div>
            <div className="card">
              <span className="label">Paid back</span>
              <div className="amount">{cents(ledger.totals.paidBack)}</div>
              <small>
                {matchesInView.length}{" "}
                {matchesInView.length === 1 ? "match" : "matches"}
              </small>
            </div>
            <div className="card">
              <span className="label">Given away</span>
              <div className="amount">{cents(ledger.totals.givenAway)}</div>
              <small>
                {ledger.totals.ignoredCount} ignored · not expecting these back
              </small>
            </div>
            <div className={`card ${ledger.totals.unapplied ? "reimb-warn" : ""}`}>
              <span className="label">Unmatched money in</span>
              <div className="amount">{cents(ledger.totals.unapplied)}</div>
              <small>
                {ledger.totals.unappliedCount}{" "}
                {ledger.totals.unappliedCount === 1 ? "inflow" : "inflows"} to
                match
              </small>
            </div>
          </div>

          <div className="card reimb-chart">
            <div className="chart-heading">
              <h2>Is it washing out?</h2>
              <span className="reimb-legend">
                <span>
                  <i style={{ background: "#236d59" }} /> Still owed
                </span>
                <span>
                  <i style={{ background: "#b9c2bd" }} /> Given away
                </span>
              </span>
            </div>
            <WashChart series={r.series} />
          </div>

          <div className="reimb-columns">
            <section className="reimb-panel reimb-out">
              <div className="reimb-panel-head">
                <h2>Money out · to collect</h2>
                <span>
                  {pickedOut.length
                    ? `${pickedOut.length} selected · ${cents(outTotal)}`
                    : `${openOut.length} open`}
                </span>
              </div>
              {openOut.length === 0 ? (
                <p className="reimb-empty">Nothing left to collect.</p>
              ) : (
                <div className="reimb-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <span className="sr-only">Select</span>
                        </th>
                        <th>Date</th>
                        <th>Payee · memo</th>
                        <th className="reimb-age-col">Age</th>
                        <th className="num">Open</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {openOut.map((x) => (
                        <tr
                          key={x.id}
                          className={selectedOut.includes(x.id) ? "picked" : ""}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedOut.includes(x.id)}
                              onChange={() =>
                                toggle(x.id, selectedOut, setSelectedOut)
                              }
                              aria-label={`Select ${x.payee} on ${shortDate(x.date)}, ${cents(x.remaining)}`}
                            />
                          </td>
                          <td className="reimb-date">{shortDate(x.date)}</td>
                          <td>
                            <strong>{x.payee}</strong>
                            <Labels row={x} />
                            {x.memo && <small>{x.memo}</small>}
                          </td>
                          <td className="reimb-age-col">
                            <Age date={x.date} />
                          </td>
                          <td className="num">
                            <strong>{cents(x.remaining)}</strong>
                            {x.status === "partial" && (
                              <small>of {cents(x.amount)}</small>
                            )}
                          </td>
                          <td className="num">
                            <button
                              className="reimb-ignore"
                              onClick={() => {
                                r.ignore(x.id);
                                setSelectedOut(
                                  selectedOut.filter((id) => id !== x.id),
                                );
                              }}
                              aria-label={`Ignore ${x.payee} on ${shortDate(x.date)}`}
                            >
                              Ignore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="reimb-side">
              <section className="reimb-panel">
                <div className="reimb-panel-head">
                  <h2>Money in · unmatched</h2>
                  <span>{openIn.length}</span>
                </div>
                {openIn.length === 0 ? (
                  <p className="reimb-empty">
                    Every inflow is matched. When someone pays you back, put it
                    in {categoryName} and refresh.
                  </p>
                ) : (
                  openIn.map((x) => (
                    <div
                      key={x.id}
                      className={`reimb-in ${selectedIn.includes(x.id) ? "picked" : ""}`}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedIn.includes(x.id)}
                          onChange={() => toggle(x.id, selectedIn, setSelectedIn)}
                        />
                        <span className="reimb-in-text">
                          <strong>{x.payee}</strong>
                          <Labels row={x} />
                          <small>
                            {shortDate(x.date)}
                            {x.memo ? ` · ${x.memo}` : ""}
                          </small>
                        </span>
                        <span className="reimb-in-amount">
                          +{cents(x.remaining)}
                          {x.status === "partial" && (
                            <small>of {cents(x.amount)}</small>
                          )}
                        </span>
                      </label>
                      <button
                        className="reimb-ignore"
                        onClick={() => {
                          r.ignore(x.id);
                          setSelectedIn(selectedIn.filter((id) => id !== x.id));
                        }}
                        aria-label={`Ignore ${x.payee} on ${shortDate(x.date)}`}
                      >
                        Ignore
                      </button>
                    </div>
                  ))
                )}
              </section>

              <section className="reimb-match" aria-label="Match preview">
                <h2>Match preview</h2>
                {pickedOut.length === 0 || pickedIn.length === 0 ? (
                  <p>
                    Select at least one money-out row and one money-in row. One
                    payment can cover several items, and several payments can
                    cover one item.
                  </p>
                ) : (
                  <>
                    <div className="reimb-match-sum">
                      <span>{pickedOut.length} out</span>
                      <span>{cents(outTotal)}</span>
                    </div>
                    <div className="reimb-match-sum">
                      <span>{pickedIn.length} in</span>
                      <span>{cents(inTotal)}</span>
                    </div>
                    <ul className="reimb-allocs">
                      {proposed.map((a) => {
                        const out = rowById(a.outflowId),
                          inflow = rowById(a.inflowId),
                          k = pairKey(a);
                        return (
                          <li key={k}>
                            <span>
                              {inflow?.payee} → {out?.payee}{" "}
                              <small>({out && shortDate(out.date)})</small>
                            </span>
                            <label>
                              <span className="sr-only">
                                Amount from {inflow?.payee} toward {out?.payee}
                              </span>
                              $
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                inputMode="decimal"
                                value={edits[k] ?? (a.amount / 100).toFixed(2)}
                                onChange={(e) =>
                                  setEdits({ ...edits, [k]: e.target.value })
                                }
                              />
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="reimb-match-sum total">
                      <span>Matching</span>
                      <span>{cents(total)}</span>
                    </div>
                    {outTotal !== inTotal && !problem && (
                      <p>
                        {outTotal > inTotal
                          ? `${cents(outTotal - total)} stays open on the money out.`
                          : `${cents(inTotal - total)} of the money in stays unmatched.`}
                      </p>
                    )}
                    {problem && (
                      <p className="reimb-problem" role="alert">
                        {problem}
                      </p>
                    )}
                    <div className="reimb-match-actions">
                      <button
                        className="primary"
                        onClick={save}
                        disabled={Boolean(problem)}
                      >
                        Mark as reimbursed
                      </button>
                      <button className="quiet" onClick={clearSelection}>
                        Clear
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>

          <details className="reimb-history">
            <summary>Reimbursed ({matchesInView.length})</summary>
            {matchesInView.length === 0 ? (
              <p>No matches yet.</p>
            ) : (
              <ul>
                {[...matchesInView].reverse().map((m) => (
                  <li key={m.id}>
                    <div>
                      {m.allocations.map((a, i) => (
                        <div key={i}>
                          {a.inflow.payee} ({shortDate(a.inflow.date)}) →{" "}
                          {a.outflow.payee} ({shortDate(a.outflow.date)}){" "}
                          <strong>{cents(a.amount)}</strong>
                        </div>
                      ))}
                    </div>
                    <button className="quiet" onClick={() => r.undoMatch(m.id)}>
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <details className="reimb-history">
            <summary>Given away / ignored ({ignoredRows.length})</summary>
            <p>
              Ignored items still count as spending in YNAB. Moving them to
              another category there removes them from this page on the next
              refresh.
            </p>
            {ignoredRows.length > 0 && (
              <ul>
                {ignoredRows.map((x) => (
                  <li key={x.id}>
                    <div>
                      <strong>{x.payee}</strong> · {shortDate(x.date)} ·{" "}
                      {x.direction === "out" ? "" : "+"}
                      {cents(x.amount - x.matched)}
                      {x.memo && <small>{x.memo}</small>}
                      <label className="reimb-reason">
                        <span className="sr-only">Note for {x.payee}</span>
                        <input
                          type="text"
                          placeholder="Why (optional)"
                          value={store.ignored[x.id]?.note ?? ""}
                          onChange={(e) => r.setNote(x.id, e.target.value)}
                        />
                      </label>
                    </div>
                    <button className="quiet" onClick={() => r.restore(x.id)}>
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </>
      )}
    </section>
  );
}
