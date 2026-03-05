import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronDown, ChevronRight, Target, DollarSign, PiggyBank, TrendingUp, TrendingDown, X, Loader2, RefreshCw } from 'lucide-react';
import { ApiKeyDialog } from './components/ApiKeyDialog';
import { BudgetSelector } from './components/BudgetSelector';
import { useApiKey, useBudgetId } from './hooks/useApiKey';
import { fetchBudgetMonths } from './api/ynab';
import { transformYnabData, type Category, type CategoryGroup } from './api/transform';

function App() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey();
  const { budgetId, setBudgetId, clearBudgetId } = useBudgetId();

  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState<number>(5000);
  const [plannedSavings, setPlannedSavings] = useState<number>(0);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadBudgetData = useCallback(async () => {
    if (!apiKey || !budgetId) return;

    setIsLoadingData(true);
    setLoadError(null);

    try {
      const months = await fetchBudgetMonths(apiKey, budgetId);
      const { categories: newCats, groups: newGroups, availableMonths: newMonths } = transformYnabData(months);

      setCategories(newCats);
      setGroups(newGroups);
      setAvailableMonths(newMonths);
      if (newMonths.length > 0) {
        const startIdx = Math.max(0, newMonths.length - 6);
        setDateRange({ start: newMonths[startIdx], end: newMonths[newMonths.length - 1] });
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load budget data');
    } finally {
      setIsLoadingData(false);
    }
  }, [apiKey, budgetId]);

  useEffect(() => {
    if (apiKey && budgetId) {
      loadBudgetData();
    }
  }, [apiKey, budgetId, loadBudgetData]);

  const handleDisconnect = () => {
    clearApiKey();
    clearBudgetId();
    setCategories([]);
    setGroups([]);
    setAvailableMonths([]);
    setDateRange({ start: '', end: '' });
  };

  const kpiValues = useMemo(() => {
    const totalTargets = categories
      .filter(c => c.type !== 'Income')
      .reduce((sum, c) => sum + c.target, 0);
    const remaining = monthlyIncome - totalTargets - plannedSavings;
    return { targets: totalTargets, income: monthlyIncome, savings: plannedSavings, remaining };
  }, [categories, monthlyIncome, plannedSavings]);

  const visibleMonths = useMemo(() => {
    const startIdx = availableMonths.indexOf(dateRange.start);
    const endIdx = availableMonths.indexOf(dateRange.end);
    if (startIdx === -1 || endIdx === -1) return availableMonths;
    return availableMonths.slice(startIdx, endIdx + 1);
  }, [dateRange, availableMonths]);

  const groupedCategories = useMemo(() => {
    const grouped: Record<string, Category[]> = {};
    groups.forEach(g => {
      grouped[g.id] = categories.filter(c => c.groupId === g.id);
    });
    return grouped;
  }, [categories, groups]);

  const groupTotals = useMemo(() => {
    const totals: Record<string, { average: number; monthlyTotals: Record<string, number>; targetSum: number }> = {};
    groups.forEach(g => {
      const groupCats = groupedCategories[g.id] || [];
      const monthlyTotals: Record<string, number> = {};
      availableMonths.forEach(m => {
        monthlyTotals[m] = groupCats.reduce((sum, c) => sum + (c.monthlyData[m] || 0), 0);
      });
      totals[g.id] = {
        average: groupCats.reduce((sum, c) => sum + c.average, 0),
        monthlyTotals,
        targetSum: groupCats.reduce((sum, c) => sum + c.target, 0),
      };
    });
    return totals;
  }, [groupedCategories, groups, availableMonths]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const updateTarget = (categoryId: string, newTarget: number) => {
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, target: newTarget } : c));
  };

  const updateCategoryField = (categoryId: string, field: 'type' | 'frequency', value: string) => {
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, [field]: value } : c));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(value));
  };

  const getCellColor = (value: number, isIncome: boolean) => {
    if (value === 0) return 'text-gray-400';
    if (isIncome) return value > 0 ? 'text-emerald-600' : 'text-red-500';
    return value < 0 ? 'text-gray-900' : 'text-emerald-600';
  };

  const chartData = useMemo(() => {
    if (!selectedCategory) return [];
    return availableMonths.map(m => ({
      month: m.split(' ')[0],
      amount: Math.abs(selectedCategory.monthlyData[m] || 0),
    }));
  }, [selectedCategory, availableMonths]);

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
              <button
                onClick={loadBudgetData}
                disabled={isLoadingData}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                title="Refresh data from YNAB"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                Refresh
              </button>
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
        {isLoadingData && (
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
                onClick={loadBudgetData}
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

        {hasData && !isLoadingData && !loadError && (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Target className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-600">Total Targets</span>
                </div>
                <div className="text-3xl font-bold text-slate-900">{formatCurrency(kpiValues.targets)}</div>
                <p className="text-xs text-slate-500 mt-1">Sum of all monthly targets</p>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-600">Monthly Income</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-slate-900">$</span>
                  <input
                    type="number"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                    className="text-3xl font-bold text-slate-900 border-0 border-b-2 border-slate-200 bg-transparent w-32 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Your typical monthly income</p>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <PiggyBank className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-600">Planned Savings</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-slate-900">$</span>
                  <input
                    type="number"
                    value={plannedSavings}
                    onChange={(e) => setPlannedSavings(Number(e.target.value))}
                    className="text-3xl font-bold text-slate-900 border-0 border-b-2 border-slate-200 bg-transparent w-32 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Monthly savings/investing transfer</p>
              </div>

              <div className={`rounded-lg border-2 p-5 ${kpiValues.remaining >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpiValues.remaining >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    {kpiValues.remaining >= 0 ? (
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-600">Remaining</span>
                </div>
                <div className={`text-3xl font-bold ${kpiValues.remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {kpiValues.remaining >= 0 ? '+' : '-'}{formatCurrency(kpiValues.remaining)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {kpiValues.remaining >= 0 ? 'Available to assign' : 'Over budget'}
                </p>
              </div>
            </div>

            <div className="flex gap-4 mb-6 items-center">
              <span className="text-sm font-medium text-slate-600">Date Range:</span>
              <select
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
              >
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="text-slate-400">to</span>
              <select
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
              >
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[280px]">Category</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700 min-w-[100px]">Type</th>
                      <th className="text-left py-3 px-3 font-semibold text-slate-700 min-w-[100px]">Frequency</th>
                      <th className="text-right py-3 px-3 font-semibold text-blue-700 bg-blue-50 min-w-[100px]">Target</th>
                      <th className="text-right py-3 px-3 font-semibold text-slate-700 bg-slate-100 min-w-[90px]">Average</th>
                      {visibleMonths.map(month => (
                        <th key={month} className="text-right py-3 px-3 font-semibold text-slate-700 min-w-[90px]">
                          {month.split(' ')[0]}
                        </th>
                      ))}
                      <th className="text-right py-3 px-3 font-semibold text-slate-700 bg-slate-100 min-w-[100px]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(group => {
                      const groupCats = groupedCategories[group.id] || [];
                      const isCollapsed = collapsedGroups.has(group.id);
                      const totals = groupTotals[group.id];

                      return (
                        <React.Fragment key={group.id}>
                          <tr
                            className="bg-slate-100 border-b border-slate-200 cursor-pointer hover:bg-slate-150"
                            onClick={() => toggleGroup(group.id)}
                          >
                            <td className="py-2.5 px-4 font-semibold text-slate-800 sticky left-0 bg-slate-100">
                              <div className="flex items-center gap-2">
                                {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                <span>{group.emoji}</span>
                                <span>{group.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">—</td>
                            <td className="py-2.5 px-3 text-slate-500">—</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-blue-700 bg-blue-50/50">
                              {group.isIncome ? '—' : formatCurrency(totals?.targetSum || 0)}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-semibold bg-slate-100 ${getCellColor(totals?.average || 0, group.isIncome)}`}>
                              {formatCurrency(totals?.average || 0)}
                            </td>
                            {visibleMonths.map(month => (
                              <td key={month} className={`py-2.5 px-3 text-right font-semibold ${getCellColor(totals?.monthlyTotals[month] || 0, group.isIncome)}`}>
                                {formatCurrency(totals?.monthlyTotals[month] || 0)}
                              </td>
                            ))}
                            <td className={`py-2.5 px-3 text-right font-semibold bg-slate-100 ${getCellColor(groupCats.reduce((s, c) => s + c.total, 0), group.isIncome)}`}>
                              {formatCurrency(groupCats.reduce((s, c) => s + c.total, 0))}
                            </td>
                          </tr>

                          {!isCollapsed && groupCats.map(category => (
                            <tr
                              key={category.id}
                              className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                              onClick={() => setSelectedCategory(category)}
                            >
                              <td className="py-2 px-4 pl-10 text-slate-700 sticky left-0 bg-white">{category.name}</td>
                              <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={category.type}
                                  onChange={(e) => updateCategoryField(category.id, 'type', e.target.value)}
                                  className="h-7 text-xs bg-transparent border border-slate-200 rounded px-2"
                                >
                                  <option value="Income">Income</option>
                                  <option value="Expense">Expense</option>
                                  <option value="Savings">Savings</option>
                                  <option value="Credit Card">Credit Card</option>
                                </select>
                              </td>
                              <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={category.frequency}
                                  onChange={(e) => updateCategoryField(category.id, 'frequency', e.target.value)}
                                  className="h-7 text-xs bg-transparent border border-slate-200 rounded px-2"
                                >
                                  <option value="Fixed">Fixed</option>
                                  <option value="Flexible">Flexible</option>
                                  <option value="Monthly">Monthly</option>
                                  <option value="Annual">Annual</option>
                                  <option value="Ad-Hoc">Ad-Hoc</option>
                                </select>
                              </td>
                              <td className="py-2 px-3 bg-blue-50/30" onClick={(e) => e.stopPropagation()}>
                                {category.type === 'Income' ? (
                                  <span className="text-slate-400 text-right block">—</span>
                                ) : (
                                  <input
                                    type="number"
                                    value={category.target}
                                    onChange={(e) => updateTarget(category.id, Number(e.target.value))}
                                    className="h-7 text-xs text-right w-20 ml-auto block bg-white border border-blue-200 rounded px-2"
                                  />
                                )}
                              </td>
                              <td className={`py-2 px-3 text-right bg-slate-50 ${getCellColor(category.average, group.isIncome)}`}>
                                {formatCurrency(category.average)}
                              </td>
                              {visibleMonths.map(month => (
                                <td key={month} className={`py-2 px-3 text-right ${getCellColor(category.monthlyData[month] || 0, group.isIncome)}`}>
                                  {formatCurrency(category.monthlyData[month] || 0)}
                                </td>
                              ))}
                              <td className={`py-2 px-3 text-right bg-slate-50 ${getCellColor(category.total, group.isIncome)}`}>
                                {formatCurrency(category.total)}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}

                    <tr className="bg-slate-800 text-white font-semibold">
                      <td className="py-3 px-4 sticky left-0 bg-slate-800">Net Income</td>
                      <td className="py-3 px-3">—</td>
                      <td className="py-3 px-3">—</td>
                      <td className="py-3 px-3 text-right bg-slate-700">{formatCurrency(kpiValues.remaining)}</td>
                      <td className="py-3 px-3 text-right bg-slate-700">{formatCurrency(categories.reduce((s, c) => s + c.average, 0))}</td>
                      {visibleMonths.map(month => {
                        const monthTotal = categories.reduce((s, c) => s + (c.monthlyData[month] || 0), 0);
                        return (
                          <td key={month} className={`py-3 px-3 text-right ${monthTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatCurrency(monthTotal)}
                          </td>
                        );
                      })}
                      <td className="py-3 px-3 text-right bg-slate-700">{formatCurrency(categories.reduce((s, c) => s + c.total, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

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

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Average</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(selectedCategory.average)}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-600 mb-1">Target</p>
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(selectedCategory.target)}</p>
                </div>
              </div>

              <div className="h-64 mb-6">
                <p className="text-sm font-medium text-slate-700 mb-3">Monthly Spending</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Amount']} />
                    <Bar dataKey="amount" fill={selectedCategory.type === 'Income' ? '#10b981' : '#3b82f6'} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Insights</p>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    {Math.abs(selectedCategory.average) > selectedCategory.target
                      ? `Average exceeds target by ${formatCurrency(Math.abs(selectedCategory.average) - selectedCategory.target)}`
                      : `On track! Target is ${formatCurrency(selectedCategory.target - Math.abs(selectedCategory.average))} above average`
                    }
                  </p>
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
