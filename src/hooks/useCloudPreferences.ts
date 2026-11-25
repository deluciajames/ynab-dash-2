import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadCloudPreferences,
  saveCloudPreferences,
  type CloudBudgetPreferences,
  type CloudPreferencesRecord,
} from "../api/preferences";
import { defaultStartDate } from "../api/reimbursements";

type SyncState =
  | {
      key: string;
      status: "idle" | "loading" | "pending" | "saving" | "saved";
    }
  | {
      key: string;
      status: "conflict";
      remote: CloudPreferencesRecord;
      message: string;
    }
  | { key: string; status: "error"; message: string };

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

const same = (a: unknown, b: unknown) =>
  stableStringify(a) === stableStringify(b);

function hasLocalChoices(value: CloudBudgetPreferences) {
  const store = value.reimbursements;
  return (
    Object.keys(value.plan.overrides).length > 0 ||
    value.plan.incomeInput !== "" ||
    value.plan.annualReserve > 0 ||
    (value.plan.cushionMonthly ?? 0) > 0 ||
    value.sortOrder.length > 0 ||
    store?.categoryIds !== null ||
    (store?.matches?.length ?? 0) > 0 ||
    Object.keys(store?.ignored ?? {}).length > 0 ||
    (store?.startDate ?? defaultStartDate()) !== defaultStartDate()
  );
}

export function useCloudPreferences(
  userId: string | null,
  budgetId: string | null,
  localSettings: CloudBudgetPreferences,
  applySettings: (settings: CloudBudgetPreferences) => void,
) {
  const key = userId && budgetId ? `${userId}:${budgetId}` : "";
  const [state, setState] = useState<SyncState>({
    key: "",
    status: "idle",
  });
  const [reloadToken, setReloadToken] = useState(0);
  const revision = useRef<number | null>(null);
  const savedSnapshot = useRef<string | null>(null);
  const currentKey = useRef(key);
  const localRef = useRef(localSettings);
  const applyRef = useRef(applySettings);
  const saving = useRef(Promise.resolve());
  currentKey.current = key;
  localRef.current = localSettings;
  applyRef.current = applySettings;
  const visibleState =
    state.key === key ? state : { key, status: "loading" as const };

  useEffect(() => {
    if (!key || !budgetId) {
      revision.current = null;
      savedSnapshot.current = null;
      setState({ key, status: "idle" });
      return;
    }
    let active = true;
    revision.current = null;
    savedSnapshot.current = null;
    setState({ key, status: "loading" });
    void (async () => {
      try {
        const remote = await loadCloudPreferences(budgetId);
        if (!active) return;
        if (!remote.settings) {
          const initialSettings = localRef.current;
          try {
            const firstSave = await saveCloudPreferences(
              budgetId,
              initialSettings,
              null,
            );
            if (!active) return;
            revision.current = firstSave.revision;
            savedSnapshot.current = stableStringify(initialSettings);
          } catch (error) {
            const details = error as {
              status?: number;
              body?: CloudPreferencesRecord;
            };
            const latestSettings = details.body?.settings;
            if (details.status !== 409 || !latestSettings) throw error;
            const latest: CloudPreferencesRecord = {
              settings: latestSettings,
              revision: details.body?.revision ?? null,
            };
            if (!active) return;
            revision.current = latest.revision;
            savedSnapshot.current = stableStringify(latest.settings);
            if (
              hasLocalChoices(initialSettings) &&
              !same(initialSettings, latestSettings)
            ) {
              setState({
                key,
                status: "conflict",
                remote: latest,
                message:
                  "Another session saved settings at the same time. Choose which copy to keep.",
              });
              return;
            }
            applyRef.current(latestSettings);
          }
          if (!active) return;
          setState({ key, status: "saved" });
          return;
        }
        revision.current = remote.revision;
        savedSnapshot.current = stableStringify(remote.settings);
        const local = localRef.current;
        if (hasLocalChoices(local) && !same(local, remote.settings)) {
          setState({
            key,
            status: "conflict",
            remote,
            message:
              "This browser and your account have different saved settings. Choose which copy to keep.",
          });
          return;
        }
        applyRef.current(remote.settings);
        setState({ key, status: "saved" });
      } catch (error) {
        if (!active) return;
        setState({
          key,
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load your saved settings.",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [key, budgetId, reloadToken]);

  useEffect(() => {
    if (
      !key ||
      !budgetId ||
      (visibleState.status !== "saved" && visibleState.status !== "pending")
    )
      return;
    if (stableStringify(localSettings) === savedSnapshot.current) {
      // A change was undone before it was saved: nothing is left to save.
      if (visibleState.status === "pending") setState({ key, status: "saved" });
      return;
    }
    if (visibleState.status === "saved") setState({ key, status: "pending" });
    const timer = window.setTimeout(() => {
      setState({ key, status: "saving" });
      saving.current = saving.current
        .catch(() => undefined)
        .then(async () => {
          if (currentKey.current !== key) return;
          try {
            const settingsToSave = localRef.current;
            const snapshotToSave = stableStringify(settingsToSave);
            const result = await saveCloudPreferences(
              budgetId,
              settingsToSave,
              revision.current,
            );
            if (currentKey.current !== key) return;
            revision.current = result.revision;
            savedSnapshot.current = snapshotToSave;
            setState({ key, status: "saved" });
          } catch (error) {
            if (currentKey.current !== key) return;
            const details = error as {
              status?: number;
              body?: CloudPreferencesRecord;
            };
            if (details.status === 409 && details.body?.settings) {
              revision.current = details.body.revision;
              setState({
                key,
                status: "conflict",
                remote: details.body,
                message:
                  "These settings changed in another session. Choose which copy to keep.",
              });
              return;
            }
            setState({
              key,
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Could not save your settings.",
            });
          }
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [key, budgetId, localSettings, visibleState.status]);

  const useAccountCopy = useCallback(() => {
    if (
      state.key !== key ||
      state.status !== "conflict" ||
      !state.remote.settings
    )
      return;
    applyRef.current(state.remote.settings);
    revision.current = state.remote.revision;
    setState({ key, status: "saved" });
  }, [key, state]);

  const keepThisBrowserCopy = useCallback(async () => {
    if (state.key !== key || state.status !== "conflict" || !budgetId) return;
    const settingsToSave = localRef.current;
    const snapshotToSave = stableStringify(settingsToSave);
    setState({ key, status: "saving" });
    try {
      const result = await saveCloudPreferences(
        budgetId,
        settingsToSave,
        state.remote.revision,
      );
      if (currentKey.current !== key) return;
      revision.current = result.revision;
      savedSnapshot.current = snapshotToSave;
      setState({ key, status: "saved" });
    } catch (error) {
      const details = error as {
        status?: number;
        body?: CloudPreferencesRecord;
      };
      if (details.status === 409 && details.body?.settings) {
        revision.current = details.body.revision;
        setState({
          key,
          status: "conflict",
          remote: details.body,
          message:
            "The account changed again. Review the newer saved copy before choosing.",
        });
      } else {
        setState({
          key,
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not save your settings.",
        });
      }
    }
  }, [budgetId, key, state]);

  const retry = useCallback(() => {
    if (key) setReloadToken((value) => value + 1);
  }, [key]);

  return {
    ...visibleState,
    useAccountCopy,
    keepThisBrowserCopy,
    retry,
  };
}
