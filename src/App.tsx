import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw, ArrowUpDown } from "lucide-react";
import { UserButton } from "@clerk/react";
import { ApiKeyDialog } from "./components/ApiKeyDialog";
import { BudgetSelector } from "./components/BudgetSelector";
import { TargetCalculator } from "./components/TargetCalculator";
import { CategoryDetail } from "./components/CategoryDetail";
import { SankeyReport } from "./components/SankeyReport";
import { SortGroupsModal } from "./components/SortGroupsModal";
import { ReimbursementTracker } from "./components/ReimbursementTracker";
import { useApiKey, useBudgetId } from "./hooks/useApiKey";
import {
  useCachedBudgetData,
  formatLastUpdated,
} from "./hooks/useCachedBudgetData";
import { useGroupSortOrder } from "./hooks/useGroupSortOrder";
import { useBudgetPlan } from "./hooks/useBudgetPlan";
import { useReimbursements } from "./hooks/useReimbursements";
import { money } from "./lib/money";
import { fetchAllMonthDetails, fetchCategoriesWithGoals } from "./api/ynab";
import { transformYnabData } from "./api/transform";
import { planCategory, totalPlan } from "./api/planning";
import type { CloudBudgetPreferences } from "./api/preferences";
import { useCloudPreferences } from "./hooks/useCloudPreferences";

type BudgetData = ReturnType<typeof transformYnabData>;
const emptyData = (): BudgetData => ({
  categories: [],
  groups: [],
  availableMonths: [],
});
function App({
  userId,
  showAccountButton = true,
}: {
  userId: string;
  showAccountButton?: boolean;
}) {
  const { apiKey, setApiKey, clearApiKey } = useApiKey(),
    { budgetId, setBudgetId, clearBudgetId } = useBudgetId();
  const { loadCached, saveData, clearData } = useCachedBudgetData();
  const { sortOrder, setSortOrder } = useGroupSortOrder();
  const settings = useBudgetPlan(budgetId);
  const [data, setData] = useState<BudgetData>(emptyData),
    [dataBudget, setDataBudget] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [showSort, setShowSort] = useState(false),
    [tab, setTab] = useState<"budget" | "reports" | "reimbursements">(
      "budget",
    ),
    [refreshKey, setRefreshKey] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  const generation = useRef(0);
  const fetchBudget = useCallback(
    async (token: string, id: string, version: number) => {
      setLoading(true);
      setError("");
      try {
        const [months, metadata] = await Promise.all([
          fetchAllMonthDetails(token, id),
          fetchCategoriesWithGoals(token, id),
        ]);
        if (generation.current !== version) return;
        const next = transformYnabData(months, metadata);
        setData(next);
        setDataBudget(id);
        setLastUpdated(Date.now());
        saveData(id, next.categories, next.groups, next.availableMonths);
      } catch (err) {
        if (generation.current === version)
          setError(
            err instanceof Error ? err.message : "Could not load your budget.",
          );
      } finally {
        if (generation.current === version) setLoading(false);
      }
    },
    [saveData],
  );
  useEffect(() => {
    const version = ++generation.current;
    setSelected(null);
    setError("");
    setData(emptyData());
    setDataBudget(null);
    setLastUpdated(null);
    setLoading(false);
    if (!apiKey || !budgetId) return;
    const cached = loadCached(budgetId);
    if (cached) {
      setData(cached);
      setDataBudget(budgetId);
      setLastUpdated(cached.lastUpdated);
    }
    void fetchBudget(apiKey, budgetId, version);
    return () => {
      generation.current++;
    };
  }, [apiKey, budgetId, fetchBudget, loadCached]);
  const refresh = () => {
    if (apiKey && budgetId) {
      void fetchBudget(apiKey, budgetId, ++generation.current);
      setRefreshKey((n) => n + 1);
    }
  };
  const disconnect = () => {
    generation.current++;
    clearApiKey();
    clearBudgetId();
    clearData();
    setData(emptyData());
    setDataBudget(null);
    setSelected(null);
  };
  const active = dataBudget === budgetId ? data : emptyData();
  const plans = useMemo(
    () =>
      Object.fromEntries(
        active.categories.map((c) => [
          c.id,
          planCategory(c, settings.overrides[c.id]),
        ]),
      ),
    [active.categories, settings.overrides],
  );
  const selectedCategory = active.categories.find((c) => c.id === selected);
  const expenses = active.categories.filter((c) => c.type !== "Income");
  const totals = totalPlan(
    expenses.map((c) => plans[c.id]),
    settings.annualReserve,
  );
  const targetMap = Object.fromEntries(
    expenses.map((c) => [c.id, plans[c.id].proposed ?? 0]),
  );
  const hasData = active.categories.length > 0;
  const reimbursements = useReimbursements(
    apiKey,
    budgetId,
    expenses,
    refreshKey,
  );
  const cloudSettings = useMemo<CloudBudgetPreferences>(
    () => ({
      version: 1,
      plan: {
        overrides: settings.overrides,
        annualReserve: settings.annualReserve,
        incomeInput: settings.incomeInput,
      },
      sortOrder,
      reimbursements: reimbursements.store,
    }),
    [
      settings.overrides,
      settings.annualReserve,
      settings.incomeInput,
      sortOrder,
      reimbursements.store,
    ],
  );
  const applyCloudSettings = useCallback(
    (saved: CloudBudgetPreferences) => {
      settings.replaceSettings(saved.plan);
      setSortOrder(saved.sortOrder);
      reimbursements.replaceStore(saved.reimbursements);
    },
    [settings.replaceSettings, setSortOrder, reimbursements.replaceStore],
  );
  const cloud = useCloudPreferences(
    userId,
    budgetId,
    cloudSettings,
    applyCloudSettings,
  );
  const owed = reimbursements.loaded ? reimbursements.ledger.totals.owed : 0;
  return (
    <div className="budget-app">
      <header>
        <div className="brand">
          <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
            <ArrowUpRight size={19} />
          </span>
          Budget clarity
        </div>
        <div className="header-controls">
          {apiKey && (
            <BudgetSelector
              apiKey={apiKey}
              selectedBudgetId={budgetId}
              onSelectBudget={setBudgetId}
            />
          )}
          {apiKey && budgetId && (
            <>
              {lastUpdated && (
                <span className="live-updated">
                  Updated {formatLastUpdated(lastUpdated)}
                </span>
              )}
              {hasData && (
                <button className="quiet" onClick={() => setShowSort(true)}>
                  <ArrowUpDown size={13} />
                  Sort groups
                </button>
              )}
              <button className="quiet" onClick={refresh} disabled={loading}>
                <RefreshCw
                  size={13}
                  className={loading ? "animate-spin" : ""}
                />
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </>
          )}
          {hasData &&
            (
              [
                ["budget", "Budget"],
                ["reports", "Reports"],
                ["reimbursements", "Reimbursements"],
              ] as const
            )
              .filter(([id]) => id !== tab)
              .map(([id, label]) => (
                <button key={id} className="quiet" onClick={() => setTab(id)}>
                  {label}
                  {id === "reimbursements" && owed > 0 && (
                    <span className="owed-badge">
                      {money(owed / 100)} owed
                    </span>
                  )}
                </button>
              ))}
          <ApiKeyDialog
            apiKey={apiKey}
            onConnect={setApiKey}
            onDisconnect={disconnect}
          />
          {cloud.status !== "idle" && (
            <span className={`sync-status ${cloud.status}`} role="status">
              {cloud.status === "loading"
                ? "Loading saved settings…"
                : cloud.status === "pending"
                  ? "Changes not saved yet"
                : cloud.status === "saving"
                  ? "Saving…"
                  : cloud.status === "saved"
                    ? "Saved to your account"
                    : cloud.status === "conflict"
                      ? "Settings need review"
                      : "Sync needs attention"}
            </span>
          )}
          {showAccountButton && <UserButton />}
        </div>
      </header>
      <main>
        {cloud.status === "error" && (
          <div className="storage-warning" role="alert">
            {cloud.message} Your latest changes remain in this browser.{" "}
            <button className="quiet" onClick={cloud.retry}>
              Retry sync
            </button>
          </div>
        )}
        {!apiKey && (
          <section className="empty-state">
            <div className="eyebrow">Your monthly plan</div>
            <h1>A clear view. A balanced plan.</h1>
            <p>
              Connect your YNAB account to compare spending, plan for future
              bills, and make room for what matters.
            </p>
            <p>
              Your planning choices sync to your account and never change
              YNAB. Your YNAB token stays in this browser.
            </p>
          </section>
        )}
        {apiKey && !budgetId && (
          <section className="empty-state">
            <h2>Select a budget</h2>
            <p>Choose your YNAB budget above to get started.</p>
          </section>
        )}
        {loading && !hasData && budgetId && (
          <section className="empty-state" role="status">
            <h2>Loading your budget…</h2>
            <p>Gathering completed months and your current YNAB targets.</p>
          </section>
        )}
        {error && (
          <div className="storage-warning" role="alert">
            {error} {hasData ? "Your last saved data is still shown." : ""}{" "}
            <button className="quiet" onClick={refresh}>
              Try again
            </button>
          </div>
        )}
        {hasData && (
          <>
            {settings.storageError && (
              <p className="storage-warning" role="alert">
                This browser could not save your latest changes. Keep this tab
                open and check whether browser storage is available.
              </p>
            )}
            {tab === "budget" ? (
              <TargetCalculator
                key={budgetId}
                categories={active.categories}
                groups={active.groups}
                groupSortOrder={sortOrder}
                overrides={settings.overrides}
                plans={plans}
                onSetOverride={settings.setOverride}
                onSetOverrides={settings.setOverrides}
                onSelectCategory={(c) => setSelected(c.id)}
                takeHome={settings.income}
                takeHomeInput={settings.incomeInput}
                onTakeHomeChange={settings.setIncomeInput}
                annualReserve={settings.annualReserve}
                onReserveChange={settings.setAnnualReserve}
                onReset={settings.resetTargets}
                availableMonths={active.availableMonths}
              />
            ) : tab === "reimbursements" ? (
              <ReimbursementTracker
                key={budgetId}
                r={reimbursements}
                categories={expenses}
              />
            ) : (
              <>
                <div className="heading">
                  <div>
                    <div className="eyebrow">Your plan</div>
                    <h1>Where your money goes.</h1>
                    <p>
                      The same category contributions and One-Off reserve as
                      your budget.
                    </p>
                  </div>
                </div>
                {totals.missingTargets > 0 && (
                  <p className="report-warning">
                    {totals.missingTargets} targets are not set. This report
                    shows only the contributions currently planned.
                  </p>
                )}
                <SankeyReport
                  categories={active.categories}
                  groups={active.groups}
                  takeHome={settings.income}
                  targetMap={targetMap}
                  reserveMonthly={settings.annualReserve / 12}
                />
              </>
            )}
          </>
        )}
        {apiKey && budgetId && !loading && !hasData && !error && (
          <section className="empty-state">
            <h2>No categories to show</h2>
            <p>Check your selected budget or refresh your YNAB data.</p>
          </section>
        )}
      </main>
      {showSort && (
        <SortGroupsModal
          groups={active.groups}
          currentOrder={sortOrder}
          onSave={setSortOrder}
          onClose={() => setShowSort(false)}
        />
      )}
      {selectedCategory && (
        <CategoryDetail
          key={selectedCategory.id}
          category={selectedCategory}
          groupName={
            active.groups.find((g) => g.id === selectedCategory.groupId)
              ?.name || ""
          }
          plan={plans[selectedCategory.id]}
          override={settings.overrides[selectedCategory.id] || {}}
          onChange={(change) =>
            settings.setOverride(selectedCategory.id, change)
          }
          onClose={() => setSelected(null)}
        />
      )}
      {cloud.status === "conflict" && (
        <div className="sync-conflict-backdrop" role="presentation">
          <section
            aria-labelledby="sync-conflict-title"
            aria-modal="true"
            className="sync-conflict"
            role="dialog"
          >
            <div className="eyebrow">Saved settings</div>
            <h2 id="sync-conflict-title">Choose which copy to keep</h2>
            <p>{cloud.message}</p>
            <p>
              Choose which copy should take precedence. The selected copy will
              replace the other for these saved preferences.
            </p>
            <div className="sync-conflict-actions">
              <button className="quiet" onClick={cloud.useAccountCopy}>
                Use account settings
              </button>
              <button
                className="primary"
                onClick={() => void cloud.keepThisBrowserCopy()}
              >
                Keep this browser’s settings
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
export default App;
