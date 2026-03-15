import { useState, useMemo, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { PiggyBank, X, Loader2, RefreshCw, Clock, ArrowUpDown } from 'lucide-react';
import { ApiKeyDialog } from './components/ApiKeyDialog';
import { BudgetSelector } from './components/BudgetSelector';
import { TargetCalculator } from './components/TargetCalculator';
import { SankeyReport } from './components/SankeyReport';
import { SortGroupsModal } from './components/SortGroupsModal';
import { useApiKey, useBudgetId, useTakeHome, useConfidence } from './hooks/useApiKey';
import { useCachedBudgetData, formatLastUpdated } from './hooks/useCachedBudgetData';
import { useGroupSortOrder } from './hooks/useGroupSortOrder';
import { useCategoryOverrides } from './hooks/useCategoryOverrides';
import { fetchAllMonthDetails } from './api/ynab';
import { transformYnabData, type Category, type CategoryGroup } from './api/transform';
import { analyzeCategory, analyzeBudget } from './api/percentiles';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
}

function App() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey();
  const { budgetId, setBudgetId, clearBudgetId } = useBudgetId();
  const { loadCached, saveData, clearData } = useCachedBudgetData();
  const { sortOrder, setSortOrder, clearSortOrder } = useGroupSortOrder();
  const { overrides, setOverride, clearAll: clearOverrides, toggleExcludedMonth } = useCategoryOverrides();
  const { takeHome, takeHomeInput, setTakeHomeInput, clearTakeHome } = useTakeHome();
  const { confidence, setConfidence } = useConfidence();
  const [showSortModal, setShowSortModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'budget' | 'reports'>('budget');

  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshFromApi = useCallback(async () => {
    if (!apiKey || !budgetId) return;

    setIsLoadingData(true);
    setLoadError(null);

    try {
      const months = await fetchAllMonthDetails(apiKey, budgetId);
      const { categories: newCats, groups: newGroups, availableMonths: newMonths } = transformYnabData(months);

      setCategories(newCats);
      setGroups(newGroups);
      setAvailableMonths(newMonths);

      saveData(budgetId, newCats, newGroups, newMonths);
      setLastUpdated(Date.now());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load budget data');
    } finally {
      setIsLoadingData(false);
    }
  }, [apiKey, budgetId, saveData]);

  useEffect(() => {
    if (!apiKey || !budgetId) return;

    const cached = loadCached(budgetId);
    if (cached) {
      setCategories(cached.categories);
      setGroups(cached.groups);
      setAvailableMonths(cached.availableMonths);
      setLastUpdated(cached.lastUpdated);
      setLoadError(null);
    } else {
      refreshFromApi();
    }
  }, [apiKey, budgetId]);

  const handleDisconnect = () => {
    clearApiKey();
    clearBudgetId();
    clearData();
    clearSortOrder();
    clearOverrides();
    clearTakeHome();
    setCategories([]);
    setGroups([]);
    setAvailableMonths([]);
    setLastUpdated(null);
  };

  const selectedExcludedMonths = useMemo(() => {
    if (!selectedCategory) return [];
    return overrides[selectedCategory.id]?.excludedMonths || [];
  }, [selectedCategory, overrides]);

  const chartData = useMemo(() => {
    if (!selectedCategory) return [];
    return availableMonths.map(m => ({
      month: m.split(' ')[0],
      fullMonth: m,
      amount: Math.abs(selectedCategory.monthlyData[m] || 0),
      excluded: selectedExcludedMonths.includes(m),
      fill: selectedExcludedMonths.includes(m)
        ? '#cbd5e1'
        : (selectedCategory.type === 'Income' ? '#10b981' : '#3b82f6'),
    }));
  }, [selectedCategory, availableMonths, selectedExcludedMonths]);

  const selectedCategoryAnalysis = useMemo(() => {
    if (!selectedCategory) return null;
    return analyzeCategory(selectedCategory, selectedExcludedMonths);
  }, [selectedCategory, selectedExcludedMonths]);

  const targetMap = useMemo(() => {
    if (categories.length === 0) return {};
    const exclusionsMap: Record<string, string[]> = {};
    for (const [catId, ov] of Object.entries(overrides)) {
      if (ov.excludedMonths && ov.excludedMonths.length > 0) {
        exclusionsMap[catId] = ov.excludedMonths;
      }
    }
    const analysis = analyzeBudget(categories, groups, exclusionsMap);
    const map: Record<string, number> = {};
    for (const a of analysis.categories) {
      const ov = overrides[a.categoryId];
      if (ov?.target !== undefined) {
        map[a.categoryId] = ov.target;
      } else if (a.isIrregular) {
        map[a.categoryId] = a.sinkingFundMonthly;
      } else {
        map[a.categoryId] = confidence === 50 ? a.p50 : confidence === 75 ? a.p75 : a.p90;
      }
    }
    return map;
  }, [categories, groups, overrides, confidence]);

  const includedStats = useMemo(() => {
    if (!selectedCategory) return { total: 0, average: 0, count: 0 };
    const entries = Object.entries(selectedCategory.monthlyData)
      .filter(([month]) => !selectedExcludedMonths.includes(month));
    const total = entries.reduce((sum, [, val]) => sum + Math.abs(val), 0);
    const count = entries.length;
    return { total, average: count > 0 ? total / count : 0, count };
  }, [selectedCategory, selectedExcludedMonths]);

  const hasData = categories.length > 0;
  const isConnected = !!apiKey;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <PiggyBank className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Budget Dashboard</h1>
              <p className="text-sm text-slate-500">Your YNAB data, visualized</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isConnected && budgetId && (
              <div className="flex items-center gap-2">
                {lastUpdated && !isLoadingData && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    {formatLastUpdated(lastUpdated)}
                  </span>
                )}
                {hasData && (
                  <button
                    onClick={() => setShowSortModal(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                    title="Sort category groups"
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    Sort
                  </button>
                )}
                <button
                  onClick={refreshFromApi}
                  disabled={isLoadingData}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                  title="Refresh data from YNAB"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            )}
            {isConnected && (
              <BudgetSelector
                apiKey={apiKey}
                selectedBudgetId={budgetId}
                onSelectBudget={setBudgetId}
              />
            )}
            <ApiKeyDialog
              apiKey={apiKey}
              onConnect={setApiKey}
              onDisconnect={handleDisconnect}
            />
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1800px] mx-auto">
        {isLoadingData && !hasData && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
            <p className="text-slate-600">Loading your budget data from YNAB...</p>
          </div>
        )}

        {loadError && !isLoadingData && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
              <p className="text-red-800 font-medium mb-2">Failed to load data</p>
              <p className="text-red-600 text-sm mb-4">{loadError}</p>
              <button
                onClick={refreshFromApi}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {!isConnected && !isLoadingData && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-white border border-slate-200 rounded-lg p-8 max-w-md text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <PiggyBank className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Connect Your YNAB Account</h2>
              <p className="text-sm text-slate-500 mb-6">
                Click "Connect to YNAB" above to enter your Personal Access Token and start viewing your budget data.
              </p>
              <p className="text-xs text-slate-400">
                You can get a token from{' '}
                <a href="https://app.ynab.com/settings/developer" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                  YNAB Developer Settings
                </a>
              </p>
            </div>
          </div>
        )}

        {isConnected && !budgetId && !isLoadingData && !loadError && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-white border border-slate-200 rounded-lg p-8 max-w-md text-center">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Select a Budget</h2>
              <p className="text-sm text-slate-500">
                Choose a budget from the dropdown above to view your spending data.
              </p>
            </div>
          </div>
        )}

        {hasData && !loadError && (
          <>
            <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
              <button
                onClick={() => setActiveTab('budget')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'budget'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Budget
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'reports'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Reports
              </button>
            </div>

            {activeTab === 'budget' && (
              <TargetCalculator
                categories={categories}
                groups={groups}
                groupSortOrder={sortOrder}
                overrides={overrides}
                onSetOverride={setOverride}
                onSelectCategory={setSelectedCategory}
                takeHome={takeHome}
                takeHomeInput={takeHomeInput}
                onTakeHomeChange={setTakeHomeInput}
                confidence={confidence}
                onConfidenceChange={setConfidence}
              />
            )}

            {activeTab === 'reports' && (
              <SankeyReport categories={categories} groups={groups} takeHome={takeHome} targetMap={targetMap} />
            )}
          </>
        )}
      </main>

      {showSortModal && (
        <SortGroupsModal
          groups={groups}
          currentOrder={sortOrder}
          onSave={setSortOrder}
          onClose={() => setShowSortModal(false)}
        />
      )}

      {selectedCategory && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedCategory(null)}>
          <div
            className="fixed right-0 top-0 h-full w-[500px] bg-white shadow-xl z-50 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">{selectedCategory.name}</h2>
                <button onClick={() => setSelectedCategory(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Average ({includedStats.count} mo)</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(includedStats.average)}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-600 mb-1">Total</p>
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(includedStats.total)}</p>
                </div>
              </div>
              {selectedCategoryAnalysis && (
                <div className="grid grid-cols-3 gap-2 mb-6">
                  <div className="p-2 bg-emerald-50 rounded-lg text-center">
                    <p className="text-[10px] text-emerald-600 mb-0.5">P50</p>
                    <p className="text-sm font-bold text-emerald-700">{formatCurrency(selectedCategoryAnalysis.p50)}</p>
                  </div>
                  <div className="p-2 bg-amber-50 rounded-lg text-center">
                    <p className="text-[10px] text-amber-600 mb-0.5">P75</p>
                    <p className="text-sm font-bold text-amber-700">{formatCurrency(selectedCategoryAnalysis.p75)}</p>
                  </div>
                  <div className="p-2 bg-red-50 rounded-lg text-center">
                    <p className="text-[10px] text-red-600 mb-0.5">P90</p>
                    <p className="text-sm font-bold text-red-700">{formatCurrency(selectedCategoryAnalysis.p90)}</p>
                  </div>
                </div>
              )}

              <div className="h-64 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-slate-700">Monthly Spending</p>
                  {selectedExcludedMonths.length > 0 && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                      {selectedExcludedMonths.length} month{selectedExcludedMonths.length !== 1 ? 's' : ''} excluded
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mb-2">Click a bar to toggle month exclusion</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} onClick={(state) => {
                    if (state && state.activePayload && state.activePayload[0]) {
                      const payload = state.activePayload[0].payload;
                      if (payload.fullMonth && selectedCategory) {
                        toggleExcludedMonth(selectedCategory.id, payload.fullMonth);
                      }
                    }
                  }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip formatter={(value: number, _name: string, props: { payload?: { excluded?: boolean } }) => [
                      formatCurrency(value),
                      props.payload?.excluded ? 'Amount (excluded)' : 'Amount'
                    ]} />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} cursor="pointer">
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={entry.excluded ? 0.4 : 1} />
                      ))}
                    </Bar>
                    {selectedCategoryAnalysis && (
                      <>
                        <ReferenceLine y={selectedCategoryAnalysis.p50} stroke="#22c55e" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: 'P50', position: 'right', fill: '#22c55e', fontSize: 11, fontWeight: 600 }} />
                        <ReferenceLine y={selectedCategoryAnalysis.p75} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: 'P75', position: 'right', fill: '#f59e0b', fontSize: 11, fontWeight: 600 }} />
                        <ReferenceLine y={selectedCategoryAnalysis.p90} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: 'P90', position: 'right', fill: '#ef4444', fontSize: 11, fontWeight: 600 }} />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Monthly Breakdown</p>
                <div className="space-y-1">
                  {availableMonths.map(m => {
                    const val = Math.abs(selectedCategory.monthlyData[m] || 0);
                    const isExcluded = selectedExcludedMonths.includes(m);
                    return (
                      <div
                        key={m}
                        className={`flex items-center justify-between text-sm py-1 border-b border-slate-100 cursor-pointer hover:bg-slate-50 rounded px-1 ${isExcluded ? 'opacity-50' : ''}`}
                        onClick={() => toggleExcludedMonth(selectedCategory.id, m)}
                      >
                        <span className={isExcluded ? 'text-slate-400 line-through' : 'text-slate-600'}>{m}</span>
                        <div className="flex items-center gap-2">
                          {isExcluded && (
                            <span className="text-xs text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded font-medium">excluded</span>
                          )}
                          <span className={isExcluded ? 'font-medium text-slate-400 line-through' : 'font-medium text-slate-900'}>{formatCurrency(val)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
