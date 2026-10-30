import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocationProblem,
  buildLedger,
  defaultStartDate,
  emptyStore,
  keepRestOfMatch,
  proposeAllocations,
  reconcile,
  sanitizeStore,
  snapshot,
  needsParentDetails,
  toReimbursementTxs,
  washSeries,
  withParentDetails,
  type ReimbursementStore,
  type ReimbursementTx,
} from "../src/api/reimbursements.ts";
import type { YnabHybridTransaction } from "../src/api/ynab.ts";

const today = new Date(2026, 9, 30);
function api(
  id: string,
  date: string,
  dollars: number,
  change: Partial<YnabHybridTransaction> = {},
): YnabHybridTransaction {
  return {
    id,
    date,
    amount: Math.round(dollars * 1000),
    memo: null,
    cleared: "cleared",
    approved: true,
    flag_color: null,
    account_id: "a",
    account_name: "Checking",
    payee_id: null,
    payee_name: "Payee " + id,
    category_id: "reimb",
    transfer_account_id: null,
    deleted: false,
    type: "transaction",
    parent_transaction_id: null,
    ...change,
  };
}
const store = (change: Partial<ReimbursementStore> = {}): ReimbursementStore => ({
  ...emptyStore(today),
  categoryId: "reimb",
  startDate: "2026-06-01",
  ...change,
});
const tx = (list: ReimbursementTx[], id: string) =>
  list.find((t) => t.id === id)!;

// A $250 dinner paid back by several people, and one Venmo covering two items.
const txs = toReimbursementTxs([
  api("dinner", "2026-07-02", -250),
  api("v1", "2026-07-05", 62.5, { payee_name: "Venmo" }),
  api("v2", "2026-07-09", 62.5, { payee_name: "Venmo" }),
  api("groceries", "2026-10-19", -54.1, {
    type: "subtransaction",
    parent_transaction_id: "p1",
  }),
  api("gas", "2026-10-24", -32.3),
  api("holden", "2026-10-26", 86.4, { payee_name: "Venmo · Holden" }),
  api("amazon", "2026-09-01", 19.99, { payee_name: "Amazon" }),
  api("gone", "2026-08-01", -10, { deleted: true }),
]);
const matchOf = (
  id: string,
  pairs: [string, string, number][],
): ReimbursementStore["matches"][number] => ({
  id,
  createdAt: "",
  allocations: pairs.map(([o, i, amount]) => ({
    outflow: snapshot(tx(txs, o)),
    inflow: snapshot(tx(txs, i)),
    amount,
  })),
});

test("converts YNAB milliunits and labels inflows", () => {
  assert.equal(txs.length, 7);
  assert.equal(tx(txs, "groceries").amount, 5410);
  assert.equal(tx(txs, "groceries").direction, "out");
  assert.equal(tx(txs, "groceries").parentId, "p1");
  assert.equal(tx(txs, "holden").kind, "payment");
  assert.equal(tx(txs, "amazon").kind, "refund");
  assert.equal(defaultStartDate(today), "2026-06-01");
});

test("matches can be partial on both sides", () => {
  const s = store({
    matches: [
      matchOf("m1", [
        ["dinner", "v1", 6250],
        ["dinner", "v2", 6250],
      ]),
      matchOf("m2", [
        ["groceries", "holden", 5410],
        ["gas", "holden", 3230],
      ]),
    ],
  });
  const ledger = buildLedger(s, txs);
  assert.equal(tx(ledger.rows, "dinner").remaining, 12500);
  assert.equal(tx(ledger.rows, "dinner").status, "partial");
  assert.equal(tx(ledger.rows, "holden").status, "done");
  assert.equal(ledger.totals.owed, 12500);
  assert.equal(ledger.totals.paidBack, 21140);
  assert.equal(ledger.totals.unapplied, 1999);
  assert.equal(ledger.totals.oldest, "2026-07-02");
});

test("ignoring writes off only what is still open", () => {
  const s = store({
    matches: [matchOf("m1", [["dinner", "v1", 6250]])],
    ignored: {
      dinner: { tx: snapshot(tx(txs, "dinner")), note: "Sam", at: "" },
    },
  });
  const ledger = buildLedger(s, txs);
  assert.equal(tx(ledger.rows, "dinner").status, "ignored");
  assert.equal(ledger.totals.givenAway, 18750);
  assert.equal(ledger.totals.owed, 8640);
  const series = washSeries(s, ledger, today);
  assert.deepEqual(
    series.map((m) => m.month),
    ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
  );
  assert.deepEqual(series[1], { month: "2026-07", owed: 0, givenAway: 18750 });
  assert.equal(series[4].owed, 8640);
});

test("wash series counts repayments in the month they arrive", () => {
  const s = store({ matches: [matchOf("m1", [["dinner", "v2", 6250]])] });
  const series = washSeries(s, buildLedger(s, txs), today);
  assert.equal(series[0].owed, 0);
  assert.equal(series[1].owed, 18750);
  assert.equal(series[2].owed, 18750);
});

test("proposes oldest-first allocations and validates edits", () => {
  const ledger = buildLedger(store(), txs);
  const out = ["groceries", "gas"].map((id) => tx(ledger.rows, id));
  const proposal = proposeAllocations(out, [tx(ledger.rows, "holden")]);
  assert.deepEqual(proposal, [
    { outflowId: "groceries", inflowId: "holden", amount: 5410 },
    { outflowId: "gas", inflowId: "holden", amount: 3230 },
  ]);
  assert.equal(allocationProblem(proposal, ledger.rows), null);
  const dinner = proposeAllocations(
    [tx(ledger.rows, "dinner")],
    ["v1", "v2"].map((id) => tx(ledger.rows, id)),
  );
  assert.equal(dinner.length, 2);
  assert.equal(dinner[1].amount, 6250);
  assert.match(
    allocationProblem(
      [{ outflowId: "gas", inflowId: "holden", amount: 9000 }],
      ledger.rows,
    )!,
    /only 32.30 left/,
  );
  assert.ok(allocationProblem([{ ...proposal[0], amount: 0 }], ledger.rows));
  assert.ok(allocationProblem([], ledger.rows));
});

test("missing and changed transactions need review instead of silent edits", () => {
  const s = store({
    matches: [
      matchOf("m2", [
        ["groceries", "holden", 5410],
        ["gas", "holden", 3230],
      ]),
    ],
    ignored: { amazon: { tx: snapshot(tx(txs, "amazon")), note: "", at: "" } },
  });
  // Gas was recategorized, Holden's Venmo was edited, Amazon moved away.
  const later = txs
    .filter((t) => t.id !== "gas" && t.id !== "amazon")
    .map((t) => (t.id === "holden" ? { ...t, amount: 8000 } : t));
  const { store: next, issues } = reconcile(s, later);
  assert.equal(issues.length, 1);
  assert.deepEqual(
    issues[0].missing.map((m) => m.id),
    ["gas"],
  );
  assert.equal(issues[0].changed[0].now.amount, 8000);
  assert.deepEqual(next.ignored, {});
  assert.equal(next.matches.length, 1);
  // While under review, the affected amounts are back to open.
  const ledger = buildLedger(next, later, issues);
  assert.equal(tx(ledger.rows, "groceries").remaining, 5410);
  assert.equal(tx(ledger.rows, "holden").remaining, 8000);
  assert.deepEqual(keepRestOfMatch(next, issues[0]).matches, []);
});

test("keeping the rest of a match drops only broken allocations", () => {
  const s = store({
    matches: [
      matchOf("m1", [
        ["dinner", "v1", 6250],
        ["dinner", "v2", 6250],
      ]),
    ],
  });
  const later = txs.filter((t) => t.id !== "v2");
  const { issues } = reconcile(s, later);
  const kept = keepRestOfMatch(s, issues[0]);
  assert.equal(kept.matches[0].allocations.length, 1);
  assert.equal(reconcile(kept, later).issues.length, 0);
});

test("split parts that get a new id keep their match", () => {
  const s = store({ matches: [matchOf("m2", [["groceries", "holden", 5410]])] });
  const later = txs.map((t) =>
    t.id === "groceries" ? { ...t, id: "groceries-new" } : t,
  );
  const { store: next, issues } = reconcile(s, later);
  assert.equal(issues.length, 0);
  assert.equal(next.matches[0].allocations[0].outflow.id, "groceries-new");
  assert.equal(tx(buildLedger(next, later).rows, "groceries-new").status, "done");
  assert.equal(reconcile(next, later).store, next);
});

test("matches before the tracking start are not reported missing", () => {
  const s = store({
    startDate: "2026-07-06",
    matches: [matchOf("m1", [["dinner", "v1", 6250]])],
  });
  const later = txs.filter((t) => t.date >= "2026-07-06");
  assert.equal(reconcile(s, later).issues.length, 0);
});

test("sanitizes stored and imported data", () => {
  assert.equal(sanitizeStore(null), null);
  assert.equal(sanitizeStore({ version: 2 }), null);
  const s = store({ matches: [matchOf("m1", [["dinner", "v1", 6250]])] });
  assert.deepEqual(sanitizeStore(JSON.parse(JSON.stringify(s))), s);
  const bad = sanitizeStore({
    ...s,
    matches: [{ id: "x", allocations: [{ amount: -1 }] }],
    ignored: { a: { note: 3 } },
  });
  assert.deepEqual(bad?.matches, []);
  assert.deepEqual(bad?.ignored, {});
});

test("split parts take the payee and memo from their parent", () => {
  const parts = [
    api("s1", "2026-10-13", -300, {
      type: "subtransaction",
      parent_transaction_id: "p9",
      payee_name: null,
    }),
    api("s2", "2026-10-13", -20, {
      type: "subtransaction",
      parent_transaction_id: "p9",
      payee_name: null,
      memo: "holden's half",
    }),
    api("t1", "2026-10-21", -5.25, { payee_name: "Starbucks" }),
  ];
  assert.equal(needsParentDetails(parts), true);
  assert.equal(needsParentDetails([parts[2]]), false);
  const filled = toReimbursementTxs(
    withParentDetails(parts, [
      { id: "p9", payee_name: "Airbnb", memo: "#hawaii26 housing" },
    ]),
  );
  assert.equal(tx(filled, "s1").payee, "Airbnb");
  assert.equal(tx(filled, "s1").memo, "#hawaii26 housing");
  assert.equal(tx(filled, "s2").memo, "holden's half");
  assert.equal(tx(filled, "t1").payee, "Starbucks");
});
