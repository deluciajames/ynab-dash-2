import { useCallback, useEffect, useState } from "react";
import type { CategoryOverride, OverridesMap } from "../api/planning";

interface Settings {
  overrides: OverridesMap;
  annualReserve: number;
  incomeInput: string;
}
const defaults = (): Settings => ({
  overrides: {},
  annualReserve: 0,
  incomeInput: "",
});
const amount = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
function read(budgetId: string | null): Settings {
  if (!budgetId) return defaults();
  try {
    const raw = localStorage.getItem(`ynab_plan_${budgetId}`);
    let value = raw ? JSON.parse(raw) : null;
    if (!value && !localStorage.getItem("ynab_plan_legacy_budget")) {
      value = {
        overrides: JSON.parse(
          localStorage.getItem("ynab_category_overrides") || "{}",
        ),
        incomeInput: localStorage.getItem("ynab_take_home") || "",
        annualReserve: 0,
      };
      localStorage.setItem("ynab_plan_legacy_budget", budgetId);
      localStorage.setItem(`ynab_plan_${budgetId}`, JSON.stringify(value));
    }
    if (!value || typeof value !== "object") return defaults();
    const overrides: OverridesMap = {};
    for (const [id, entry] of Object.entries(value.overrides || {})) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as CategoryOverride,
        clean: CategoryOverride = {};
      for (const key of [
        "target",
        "currentMonthly",
        "billAmount",
        "saved",
        "expectedAnnual",
        "savingsMonthly",
      ] as const)
        if (
          amount(candidate[key]) ||
          (candidate[key] === null && key !== "target")
        )
          Object.assign(clean, { [key]: candidate[key] });
      if (
        candidate.fundingType &&
        ["monthly", "annual", "irregular", "savings", "oneoff"].includes(
          candidate.fundingType,
        )
      )
        clean.fundingType = candidate.fundingType;
      if (typeof candidate.oneOff === "boolean")
        clean.oneOff = candidate.oneOff;
      if (typeof candidate.fixedBill === "boolean")
        clean.fixedBill = candidate.fixedBill;
      if (Array.isArray(candidate.excludedMonths))
        clean.excludedMonths = candidate.excludedMonths.filter(
          (x) => typeof x === "string",
        );
      if (typeof candidate.dueDate === "string")
        clean.dueDate = candidate.dueDate;
      if (
        candidate.exclusionReasons &&
        typeof candidate.exclusionReasons === "object"
      )
        clean.exclusionReasons = Object.fromEntries(
          Object.entries(candidate.exclusionReasons).filter(
            ([, v]) => typeof v === "string",
          ),
        );
      overrides[id] = clean;
    }
    return {
      overrides,
      annualReserve: amount(value.annualReserve) ? value.annualReserve : 0,
      incomeInput:
        typeof value.incomeInput === "string" ? value.incomeInput : "",
    };
  } catch {
    return defaults();
  }
}
export function useBudgetPlan(budgetId: string | null) {
  const [state, setState] = useState(() => ({
    budgetId,
    settings: read(budgetId),
  }));
  const settings =
    state.budgetId === budgetId ? state.settings : read(budgetId);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setState({ budgetId, settings: read(budgetId) });
    setStorageError(false);
  }, [budgetId]);
  useEffect(() => {
    if (!budgetId || state.budgetId !== budgetId) return;
    try {
      localStorage.setItem(
        `ynab_plan_${budgetId}`,
        JSON.stringify(state.settings),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [budgetId, state]);
  const update = useCallback(
    (fn: (old: Settings) => Settings) => {
      if (!budgetId) return;
      setState((old) => {
        const next = fn(
          old.budgetId === budgetId ? old.settings : read(budgetId),
        );
        return { budgetId, settings: next };
      });
    },
    [budgetId],
  );
  const setOverrides = useCallback(
    (changes: Record<string, Partial<CategoryOverride>>) =>
      update((old) => {
        const overrides = { ...old.overrides };
        for (const [id, change] of Object.entries(changes))
          overrides[id] = { ...overrides[id], ...change };
        return { ...old, overrides };
      }),
    [update],
  );
  const setOverride = useCallback(
    (id: string, change: Partial<CategoryOverride>) =>
      setOverrides({ [id]: change }),
    [setOverrides],
  );
  const setAnnualReserve = useCallback(
    (annualReserve: number) => update((old) => ({ ...old, annualReserve })),
    [update],
  );
  const setIncomeInput = useCallback(
    (incomeInput: string) => update((old) => ({ ...old, incomeInput })),
    [update],
  );
  const resetTargets = useCallback(
    () =>
      update((old) => ({
        ...old,
        overrides: Object.fromEntries(
          Object.entries(old.overrides).map(([id, ov]) => [
            id,
            { ...ov, target: undefined },
          ]),
        ),
      })),
    [update],
  );
  const parsed = Number(settings.incomeInput);
  const income =
    settings.incomeInput.trim() !== "" && Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : null;
  return {
    ...settings,
    income,
    setOverride,
    setOverrides,
    setAnnualReserve,
    setIncomeInput,
    resetTargets,
    storageError,
  };
}
