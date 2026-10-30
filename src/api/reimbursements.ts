import type { YnabHybridTransaction, YnabTransactionSummary } from "./ynab";

// All amounts here are whole cents, so allocations add up exactly.
export interface ReimbursementTx {
  id: string;
  categoryId: string | null;
  parentId: string | null;
  date: string;
  payee: string;
  memo: string;
  amount: number;
  direction: "out" | "in";
  pending: boolean;
  kind: "payment" | "refund" | null;
}
export type TxSnapshot = Pick<
  ReimbursementTx,
  "id" | "parentId" | "date" | "payee" | "memo" | "amount"
>;
export interface Allocation {
  outflow: TxSnapshot;
  inflow: TxSnapshot;
  amount: number;
}
export interface Match {
  id: string;
  createdAt: string;
  allocations: Allocation[];
}
export interface IgnoreEntry {
  tx: TxSnapshot;
  note: string;
  at: string;
}
export interface ReimbursementStore {
  version: 1;
  /** Tracked categories; null until chosen, when they are guessed by name. */
  categoryIds: string[] | null;
  startDate: string;
  matches: Match[];
  ignored: Record<string, IgnoreEntry>;
}

const PAYMENT_APPS =
  /venmo|zelle|paypal|cash ?app|apple ?cash|square cash|transfer|reimburs/i;

export function defaultStartDate(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth() - 4, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
export const emptyStore = (today = new Date()): ReimbursementStore => ({
  version: 1,
  categoryIds: null,
  startDate: defaultStartDate(today),
  matches: [],
  ignored: {},
});

/** Split parts with no payee of their own. */
export const needsParentDetails = (transactions: YnabHybridTransaction[]) =>
  transactions.some(
    (t) => !t.deleted && t.parent_transaction_id && !t.payee_name,
  );

/**
 * YNAB leaves the payee (and often the memo) on the parent of a split, so
 * split parts take them from the parent when they have none of their own.
 */
export function withParentDetails(
  transactions: YnabHybridTransaction[],
  parents: YnabTransactionSummary[],
): YnabHybridTransaction[] {
  const byId = new Map(parents.map((p) => [p.id, p]));
  return transactions.map((t) => {
    const parent = t.parent_transaction_id
      ? byId.get(t.parent_transaction_id)
      : undefined;
    return parent
      ? {
          ...t,
          payee_name: t.payee_name || parent.payee_name,
          memo: t.memo || parent.memo,
        }
      : t;
  });
}

export function toReimbursementTxs(
  transactions: YnabHybridTransaction[],
): ReimbursementTx[] {
  return transactions
    .filter((t) => !t.deleted && t.amount !== 0)
    .map((t): ReimbursementTx => {
      const amount = Math.round(t.amount / 10),
        direction = amount < 0 ? ("out" as const) : ("in" as const),
        payee = t.payee_name || "(no payee)";
      return {
        id: t.id,
        categoryId: t.category_id,
        parentId: t.parent_transaction_id ?? null,
        date: t.date,
        payee,
        memo: t.memo || "",
        amount: Math.abs(amount),
        direction,
        pending: t.cleared === "uncleared",
        kind:
          direction === "out"
            ? null
            : PAYMENT_APPS.test(payee) || t.transfer_account_id
              ? "payment"
              : "refund",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export const snapshot = (t: ReimbursementTx): TxSnapshot => ({
  id: t.id,
  parentId: t.parentId,
  date: t.date,
  payee: t.payee,
  memo: t.memo,
  amount: t.amount,
});

export interface ReviewIssue {
  matchId: string;
  missing: TxSnapshot[];
  changed: { before: TxSnapshot; now: ReimbursementTx }[];
}

/**
 * Lines saved matches and ignores up with the latest YNAB transactions.
 * Split edits can give a subtransaction a new id; one unclaimed row with the
 * same parent and amount takes over the old id. Ignored rows that left the
 * category are dropped. Matches that lost or changed a transaction are
 * reported for review and never edited silently.
 */
export function reconcile(store: ReimbursementStore, txs: ReimbursementTx[]) {
  const byId = new Map(txs.map((t) => [t.id, t]));
  const referenced = new Set<string>(Object.keys(store.ignored));
  for (const m of store.matches)
    for (const a of m.allocations) {
      referenced.add(a.outflow.id);
      referenced.add(a.inflow.id);
    }
  const remap = new Map<string, string>();
  const relocate = (s: TxSnapshot) => {
    if (byId.has(s.id) || !s.parentId || s.date < store.startDate) return;
    if (remap.has(s.id)) return;
    const candidates = txs.filter(
      (t) =>
        t.parentId === s.parentId &&
        t.amount === s.amount &&
        !referenced.has(t.id),
    );
    if (candidates.length === 1) {
      remap.set(s.id, candidates[0].id);
      referenced.add(candidates[0].id);
    }
  };
  for (const entry of Object.values(store.ignored)) relocate(entry.tx);
  for (const m of store.matches)
    for (const a of m.allocations) {
      relocate(a.outflow);
      relocate(a.inflow);
    }
  const move = (s: TxSnapshot): TxSnapshot => {
    const id = remap.get(s.id);
    return id ? { ...s, id } : s;
  };
  const inWindow = (s: TxSnapshot) => s.date >= store.startDate;
  const ignored: Record<string, IgnoreEntry> = {};
  for (const entry of Object.values(store.ignored)) {
    const tx = move(entry.tx),
      now = byId.get(tx.id);
    if (now) ignored[tx.id] = { ...entry, tx: snapshot(now) };
    else if (!inWindow(tx)) ignored[tx.id] = { ...entry, tx };
  }
  const issues: ReviewIssue[] = [];
  const matches = store.matches.map((m) => {
    const allocations = m.allocations.map((a) => ({
      ...a,
      outflow: move(a.outflow),
      inflow: move(a.inflow),
    }));
    const missing = new Map<string, TxSnapshot>(),
      changed = new Map<string, ReviewIssue["changed"][number]>();
    for (const a of allocations)
      for (const s of [a.outflow, a.inflow]) {
        if (!inWindow(s)) continue;
        const now = byId.get(s.id);
        if (!now) missing.set(s.id, s);
        else if (now.amount !== s.amount)
          changed.set(s.id, { before: s, now });
      }
    if (missing.size || changed.size)
      issues.push({
        matchId: m.id,
        missing: [...missing.values()],
        changed: [...changed.values()],
      });
    return { ...m, allocations };
  });
  const next: ReimbursementStore = { ...store, matches, ignored };
  const storeChanged =
    remap.size > 0 ||
    Object.keys(ignored).length !== Object.keys(store.ignored).length ||
    Object.entries(ignored).some(
      ([id, e]) =>
        JSON.stringify(e.tx) !== JSON.stringify(store.ignored[id]?.tx),
    );
  return { store: storeChanged ? next : store, issues };
}

/** Removes the allocations that touch a missing or changed transaction. */
export function keepRestOfMatch(
  store: ReimbursementStore,
  issue: ReviewIssue,
): ReimbursementStore {
  const broken = new Set([
    ...issue.missing.map((s) => s.id),
    ...issue.changed.map((c) => c.before.id),
  ]);
  return {
    ...store,
    matches: store.matches
      .map((m) =>
        m.id !== issue.matchId
          ? m
          : {
              ...m,
              allocations: m.allocations.filter(
                (a) => !broken.has(a.outflow.id) && !broken.has(a.inflow.id),
              ),
            },
      )
      .filter((m) => m.allocations.length > 0),
  };
}

export interface LedgerRow extends ReimbursementTx {
  matched: number;
  remaining: number;
  ignored: boolean;
  status: "open" | "partial" | "done" | "ignored";
}

export function buildLedger(
  store: ReimbursementStore,
  txs: ReimbursementTx[],
  issues: ReviewIssue[] = [],
) {
  const ids = new Set(txs.map((t) => t.id));
  // Rows before the tracking start are not fetched but are not missing either.
  const present = {
    has: (s: TxSnapshot) => ids.has(s.id) || s.date < store.startDate,
  };
  const flagged = new Set(
    issues.flatMap((i) => i.changed.map((c) => `${i.matchId}:${c.before.id}`)),
  );
  // Allocations only count while both sides exist with their matched amount.
  const counts = (m: Match, a: Allocation) =>
    present.has(a.outflow) &&
    present.has(a.inflow) &&
    !flagged.has(`${m.id}:${a.outflow.id}`) &&
    !flagged.has(`${m.id}:${a.inflow.id}`);
  const matched = new Map<string, number>();
  for (const m of store.matches)
    for (const a of m.allocations)
      if (counts(m, a))
        for (const id of [a.outflow.id, a.inflow.id])
          matched.set(id, (matched.get(id) ?? 0) + a.amount);
  const rows: LedgerRow[] = txs
    .filter((t) => t.date >= store.startDate)
    .map((t) => {
      const used = matched.get(t.id) ?? 0,
        remaining = Math.max(0, t.amount - used),
        ignored = Boolean(store.ignored[t.id]) && remaining > 0;
      return {
        ...t,
        matched: used,
        remaining: ignored ? 0 : remaining,
        ignored,
        status: ignored
          ? "ignored"
          : remaining === 0
            ? "done"
            : used > 0
              ? "partial"
              : "open",
      };
    });
  const outflows = rows.filter((r) => r.direction === "out"),
    inflows = rows.filter((r) => r.direction === "in");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  let paidBack = 0;
  for (const m of store.matches)
    for (const a of m.allocations)
      if (counts(m, a) && a.outflow.date >= store.startDate)
        paidBack += a.amount;
  const openOut = outflows.filter((r) => r.remaining > 0);
  return {
    rows,
    outflows,
    inflows,
    totals: {
      owed: sum(openOut.map((r) => r.remaining)),
      openCount: openOut.length,
      oldest: openOut.reduce<string | null>(
        (min, r) => (min === null || r.date < min ? r.date : min),
        null,
      ),
      paidBack,
      givenAway: sum(
        outflows.filter((r) => r.ignored).map((r) => r.amount - r.matched),
      ),
      ignoredCount: rows.filter((r) => r.ignored).length,
      unapplied: sum(inflows.map((r) => r.remaining)),
      unappliedCount: inflows.filter((r) => r.remaining > 0).length,
    },
  };
}

/** Pairs oldest outflows with oldest inflows until one side runs out. */
export function proposeAllocations(
  outflows: LedgerRow[],
  inflows: LedgerRow[],
): { outflowId: string; inflowId: string; amount: number }[] {
  const outs = [...outflows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ id: r.id, left: r.remaining }));
  const ins = [...inflows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ id: r.id, left: r.remaining }));
  const result = [];
  let i = 0,
    j = 0;
  while (i < outs.length && j < ins.length) {
    const amount = Math.min(outs[i].left, ins[j].left);
    if (amount > 0)
      result.push({ outflowId: outs[i].id, inflowId: ins[j].id, amount });
    outs[i].left -= amount;
    ins[j].left -= amount;
    if (outs[i].left === 0) i++;
    if (ins[j].left === 0) j++;
  }
  return result;
}

/** Returns a reason when the allocations cannot be saved, else null. */
export function allocationProblem(
  allocations: { outflowId: string; inflowId: string; amount: number }[],
  rows: LedgerRow[],
): string | null {
  if (!allocations.length) return "Select money out and money in to match.";
  if (allocations.some((a) => !Number.isInteger(a.amount) || a.amount <= 0))
    return "Each amount must be more than $0.00.";
  const used = new Map<string, number>();
  for (const a of allocations)
    for (const id of [a.outflowId, a.inflowId])
      used.set(id, (used.get(id) ?? 0) + a.amount);
  for (const [id, amount] of used) {
    const row = rows.find((r) => r.id === id);
    if (!row) return "A selected transaction is no longer available.";
    if (amount > row.remaining)
      return `${row.payee} has only ${(row.remaining / 100).toFixed(2)} left to match.`;
  }
  return null;
}

export interface WashMonth {
  month: string;
  owed: number;
  givenAway: number;
}

/** Open balance and given-away total at the end of each month. */
export function washSeries(
  store: ReimbursementStore,
  ledger: ReturnType<typeof buildLedger>,
  today = new Date(),
): WashMonth[] {
  const months: string[] = [];
  const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = store.startDate.split("-").map(Number);
  for (let d = new Date(y, m - 1, 1); ; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key > end || months.length > 120) break;
    months.push(key);
  }
  // Repayments toward a written-off item are already netted out of givenAway.
  const outIds = new Set(
    ledger.outflows.filter((r) => !r.ignored).map((r) => r.id),
  );
  const present = new Set(ledger.rows.map((r) => r.id));
  const repayments: { date: string; amount: number }[] = [];
  for (const match of store.matches)
    for (const a of match.allocations)
      if (
        outIds.has(a.outflow.id) &&
        (present.has(a.inflow.id) || a.inflow.date < store.startDate)
      )
        repayments.push({
          date: a.inflow.date > a.outflow.date ? a.inflow.date : a.outflow.date,
          amount: a.amount,
        });
  return months.map((month) => {
    const cutoff = `${month}-31`;
    let owed = 0,
      givenAway = 0;
    for (const r of ledger.outflows) {
      if (r.date > cutoff) continue;
      if (r.ignored) givenAway += r.amount - r.matched;
      else owed += r.amount;
    }
    for (const p of repayments) if (p.date <= cutoff) owed -= p.amount;
    return { month, owed: Math.max(0, owed), givenAway };
  });
}

const isSnapshot = (s: unknown): s is TxSnapshot => {
  const v = s as TxSnapshot;
  return (
    !!v &&
    typeof v.id === "string" &&
    (v.parentId === null || typeof v.parentId === "string") &&
    typeof v.date === "string" &&
    typeof v.payee === "string" &&
    typeof v.memo === "string" &&
    Number.isInteger(v.amount)
  );
};

/** Validates stored or imported data; returns null if it is unusable. */
export function sanitizeStore(value: unknown): ReimbursementStore | null {
  const v = value as Partial<ReimbursementStore>,
    legacy = value as { categoryId?: unknown };
  if (!v || typeof v !== "object" || v.version !== 1) return null;
  if (typeof v.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.startDate))
    return null;
  const matches: Match[] = [];
  for (const m of Array.isArray(v.matches) ? v.matches : []) {
    if (!m || typeof m.id !== "string" || !Array.isArray(m.allocations))
      continue;
    const allocations = m.allocations.filter(
      (a) =>
        a &&
        isSnapshot(a.outflow) &&
        isSnapshot(a.inflow) &&
        Number.isInteger(a.amount) &&
        a.amount > 0,
    );
    if (allocations.length)
      matches.push({
        id: m.id,
        createdAt: typeof m.createdAt === "string" ? m.createdAt : "",
        allocations,
      });
  }
  const ignored: Record<string, IgnoreEntry> = {};
  for (const e of Object.values(v.ignored && typeof v.ignored === "object" ? v.ignored : {}))
    if (e && isSnapshot(e.tx))
      ignored[e.tx.id] = {
        tx: e.tx,
        note: typeof e.note === "string" ? e.note : "",
        at: typeof e.at === "string" ? e.at : "",
      };
  return {
    version: 1,
    categoryIds: Array.isArray(v.categoryIds)
      ? v.categoryIds.filter((id): id is string => typeof id === "string")
      : // Saved before several categories could be tracked.
        typeof legacy.categoryId === "string"
        ? [legacy.categoryId]
        : null,
    startDate: v.startDate,
    matches,
    ignored,
  };
}

export function daysSince(date: string, today = new Date()) {
  const [y, m, d] = date.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d),
    now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((now - start) / 86400000));
}
