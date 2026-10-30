import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCategoryTransactions,
  fetchTransactionsSince,
} from "../api/ynab";
import type { Category } from "../api/transform";
import {
  buildLedger,
  emptyStore,
  keepRestOfMatch,
  reconcile,
  sanitizeStore,
  snapshot,
  needsParentDetails,
  toReimbursementTxs,
  withParentDetails,
  washSeries,
  type ReimbursementStore,
  type ReimbursementTx,
  type ReviewIssue,
} from "../api/reimbursements";

const NONE: ReimbursementTx[] = [];
const key = (budgetId: string) => `ynab_reimburse_${budgetId}`;
function read(budgetId: string | null): ReimbursementStore {
  if (!budgetId) return emptyStore();
  try {
    const raw = localStorage.getItem(key(budgetId));
    return (raw && sanitizeStore(JSON.parse(raw))) || emptyStore();
  } catch {
    return emptyStore();
  }
}
export function guessCategories(categories: Category[]) {
  const reimbursed =
    categories.find((c) => /getting reimbursed/i.test(c.name)) ??
    categories.find((c) => /reimburs/i.test(c.name));
  const credits = categories.filter((c) => /credit card credit/i.test(c.name));
  return [reimbursed, ...credits].filter((c): c is Category => Boolean(c));
}

export function useReimbursements(
  apiKey: string | null,
  budgetId: string | null,
  categories: Category[],
  refreshKey: number,
) {
  const [state, setState] = useState(() => ({
    budgetId,
    store: read(budgetId),
  }));
  const store = state.budgetId === budgetId ? state.store : read(budgetId);
  const [storageError, setStorageError] = useState(false);
  const [txs, setTxs] = useState<{ key: string; list: ReimbursementTx[] }>({
    key: "",
    list: [],
  });
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setState({ budgetId, store: read(budgetId) });
    setStorageError(false);
  }, [budgetId]);
  useEffect(() => {
    if (!budgetId || state.budgetId !== budgetId) return;
    try {
      localStorage.setItem(key(budgetId), JSON.stringify(state.store));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [budgetId, state]);
  const update = useCallback(
    (fn: (old: ReimbursementStore) => ReimbursementStore) => {
      if (!budgetId) return;
      setState((old) => ({
        budgetId,
        store: fn(old.budgetId === budgetId ? old.store : read(budgetId)),
      }));
    },
    [budgetId],
  );

  const tracked = store.categoryIds
    ? store.categoryIds.flatMap((id) => categories.filter((c) => c.id === id))
    : guessCategories(categories);
  const trackedIds = tracked.map((c) => c.id);
  const fetchKey = `${budgetId}|${trackedIds.join(",")}|${store.startDate}`;
  const generation = useRef(0);
  useEffect(() => {
    const version = ++generation.current;
    setError("");
    if (!apiKey || !budgetId || !trackedIds.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      trackedIds.map((id) =>
        fetchCategoryTransactions(apiKey, budgetId, id, store.startDate),
      ),
    )
      .then(async (lists) => {
        // Keep each transaction once, even if YNAB lists it twice.
        const list = [
          ...new Map(lists.flat().map((t) => [t.id, t])).values(),
        ];
        return needsParentDetails(list)
          ? withParentDetails(
              list,
              await fetchTransactionsSince(apiKey, budgetId, store.startDate),
            )
          : list;
      })
      .then((list) => {
        if (generation.current !== version) return;
        setTxs({ key: fetchKey, list: toReimbursementTxs(list) });
      })
      .catch((err) => {
        if (generation.current === version)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load reimbursement transactions.",
          );
      })
      .finally(() => {
        if (generation.current === version) setLoading(false);
      });
    // fetchKey covers budget, category and start date.
  }, [apiKey, fetchKey, refreshKey]);

  const loaded = txs.key === fetchKey;
  const list = loaded ? txs.list : NONE;
  const reconciled = useMemo(
    () =>
      loaded
        ? reconcile(store, list)
        : { store, issues: [] as ReviewIssue[] },
    [loaded, store, list],
  );
  useEffect(() => {
    if (reconciled.store !== store) update(() => reconciled.store);
  }, [reconciled.store, store, update]);
  const ledger = useMemo(
    () => buildLedger(reconciled.store, list, reconciled.issues),
    [reconciled, list],
  );
  const series = useMemo(
    () => washSeries(reconciled.store, ledger),
    [reconciled.store, ledger],
  );

  const withCategory = (old: ReimbursementStore) => ({
    ...old,
    categoryIds: old.categoryIds ?? trackedIds,
  });
  const byId = (id: string) => list.find((t) => t.id === id);
  return {
    store,
    tracked,
    loaded,
    loading,
    error,
    storageError,
    ledger,
    series,
    issues: reconciled.issues,
    toggleCategory: (id: string) =>
      update((old) => {
        const ids = old.categoryIds ?? trackedIds;
        return {
          ...old,
          categoryIds: ids.includes(id)
            ? ids.filter((x) => x !== id)
            : [...ids, id],
        };
      }),
    setStartDate: (startDate: string) =>
      update((old) => ({ ...old, startDate })),
    addMatch: (
      allocations: { outflowId: string; inflowId: string; amount: number }[],
    ) =>
      update((old) => ({
        ...withCategory(old),
        matches: [
          ...old.matches,
          {
            id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            createdAt: new Date().toISOString(),
            allocations: allocations.flatMap((a) => {
              const outflow = byId(a.outflowId),
                inflow = byId(a.inflowId);
              return outflow && inflow
                ? [
                    {
                      outflow: snapshot(outflow),
                      inflow: snapshot(inflow),
                      amount: a.amount,
                    },
                  ]
                : [];
            }),
          },
        ],
      })),
    undoMatch: (matchId: string) =>
      update((old) => ({
        ...old,
        matches: old.matches.filter((m) => m.id !== matchId),
      })),
    keepRest: (issue: ReviewIssue) =>
      update((old) => keepRestOfMatch(old, issue)),
    ignore: (id: string) =>
      update((old) => {
        const tx = byId(id);
        return tx
          ? {
              ...withCategory(old),
              ignored: {
                ...old.ignored,
                [id]: { tx: snapshot(tx), note: "", at: new Date().toISOString() },
              },
            }
          : old;
      }),
    restore: (id: string) =>
      update((old) => {
        const ignored = { ...old.ignored };
        delete ignored[id];
        return { ...old, ignored };
      }),
    setNote: (id: string, note: string) =>
      update((old) =>
        old.ignored[id]
          ? {
              ...old,
              ignored: { ...old.ignored, [id]: { ...old.ignored[id], note } },
            }
          : old,
      ),
    exportData: () => ({
      kind: "budget-clarity-reimbursements",
      exportedAt: new Date().toISOString(),
      budgetId,
      data: withCategory(store),
    }),
    importData: (value: unknown): string | null => {
      const v = value as { kind?: string; data?: unknown };
      const next =
        v && v.kind === "budget-clarity-reimbursements"
          ? sanitizeStore(v.data)
          : null;
      if (!next) return "That file is not a reimbursement backup.";
      update(() => next);
      return null;
    },
  };
}
export type Reimbursements = ReturnType<typeof useReimbursements>;
