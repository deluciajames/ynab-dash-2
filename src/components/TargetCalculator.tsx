import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, Shield, Clock, TrendingUp } from 'lucide-react';
import type { Category, CategoryGroup } from '../api/transform';
import { analyzeBudget, type CategoryAnalysis } from '../api/percentiles';
import { applySortOrder } from '../hooks/useGroupSortOrder';

type ConfidenceLevel = 50 | 75 | 90;

interface TargetCalculatorProps {
  categories: Category[];
  groups: CategoryGroup[];
  groupSortOrder: string[];
  onSelectCategory: (category: Category) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function TargetCalculator({ categories, groups, groupSortOrder, onSelectCategory }: TargetCalculatorProps) {
  const [confidence, setConfidence] = useState<ConfidenceLevel>(75);
  const [takeHome, setTakeHome] = useState<number | null>(null);
  const [takeHomeInput, setTakeHomeInput] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const analysis = useMemo(
    () => analyzeBudget(categories, groups),
    [categories, groups]
  );

  const totalAtLevel = confidence === 50
    ? analysis.totalAtP50
    : confidence === 75
      ? analysis.totalAtP75
      : analysis.totalAtP90;

  const bufferToApply = confidence < 90 ? analysis.totalBuffer : 0;
  const totalBudget = totalAtLevel + bufferToApply;
  const overBudget = takeHome !== null && totalBudget > takeHome;
  const remaining = takeHome !== null ? takeHome - totalBudget : null;

  const expenseGroups = useMemo(
    () => applySortOrder(groups.filter(g => !g.isIncome), groupSortOrder),
    [groups, groupSortOrder]
  );

  const groupedAnalyses = useMemo(() => {
    const grouped: Record<string, CategoryAnalysis[]> = {};
    for (const g of expenseGroups) {
      grouped[g.id] = analysis.categories
        .filter(a => a.groupId === g.id)
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    }
    return grouped;
  }, [analysis, expenseGroups]);

  const groupTotals = useMemo(() => {
    const totals: Record<string, { p50: number; p75: number; p90: number; target: number; buffer: number }> = {};
    for (const g of expenseGroups) {
      const cats = groupedAnalyses[g.id] || [];
      totals[g.id] = {
        p50: cats.reduce((s, a) => s + (a.isIrregular ? a.sinkingFundMonthly : a.p50), 0),
        p75: cats.reduce((s, a) => s + (a.isIrregular ? a.sinkingFundMonthly : a.p75), 0),
        p90: cats.reduce((s, a) => s + (a.isIrregular ? a.sinkingFundMonthly : a.p90), 0),
        target: cats.reduce((s, a) => s + a.recommendedTarget, 0),
        buffer: cats.reduce((s, a) => s + a.bufferAmount, 0),
      };
    }
    return totals;
  }, [groupedAnalyses, expenseGroups]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleTakeHomeChange = (value: string) => {
    setTakeHomeInput(value);
    const num = parseFloat(value);
    setTakeHome(isNaN(num) || num <= 0 ? null : num);
  };

  const getTargetForLevel = (a: CategoryAnalysis): number => {
    if (a.isIrregular) return a.sinkingFundMonthly;
    return confidence === 50 ? a.p50 : confidence === 75 ? a.p75 : a.p90;
  };

  const getGroupTargetForLevel = (groupId: string): number => {
    const t = groupTotals[groupId];
    if (!t) return 0;
    return confidence === 50 ? t.p50 : confidence === 75 ? t.p75 : t.p90;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Confidence Level</label>
          <div className="flex bg-slate-100 rounded-lg p-1">
            {([50, 75, 90] as ConfidenceLevel[]).map(level => (
              <button
                key={level}
                onClick={() => setConfidence(level)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  confidence === level
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {level === 50 ? '50th (Lean)' : level === 75 ? '75th (Balanced)' : '90th (Safe)'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Monthly Take-Home (optional)</label>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-sm">$</span>
            <input
              type="number"
              value={takeHomeInput}
              onChange={(e) => handleTakeHomeChange(e.target.value)}
              placeholder="5,000"
              className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {overBudget && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            Your recommended budget ({formatCurrency(totalBudget)}) exceeds your take-home ({formatCurrency(takeHome!)}) by{' '}
            <span className="font-semibold">{formatCurrency(totalBudget - takeHome!)}</span>.
            Consider using a leaner confidence level or reviewing your categories.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-slate-600">Monthly Budget</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{formatCurrency(totalAtLevel)}</div>
          <p className="text-xs text-slate-500 mt-1">At {confidence}th percentile</p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-slate-600">Recommended Buffer</span>
          </div>
          <div className="text-3xl font-bold text-purple-700">{formatCurrency(analysis.totalBuffer)}</div>
          <p className="text-xs text-slate-500 mt-1">Gap between 75th and 90th across all categories</p>
        </div>

        <div className={`rounded-lg border-2 p-5 ${
          remaining === null
            ? 'bg-slate-50 border-slate-200'
            : remaining >= 0
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              remaining === null ? 'bg-slate-100' : remaining >= 0 ? 'bg-emerald-100' : 'bg-red-100'
            }`}>
              <TrendingUp className={`w-5 h-5 ${
                remaining === null ? 'text-slate-400' : remaining >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`} />
            </div>
            <span className="text-sm font-medium text-slate-600">
              {remaining === null ? 'Remaining' : remaining >= 0 ? 'Remaining' : 'Over Budget'}
            </span>
          </div>
          <div className={`text-3xl font-bold ${
            remaining === null ? 'text-slate-400' : remaining >= 0 ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {remaining === null ? '—' : formatCurrency(Math.abs(remaining))}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {remaining === null ? 'Enter take-home to see' : 'After budget + buffer'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[280px]">Category</th>
                <th className="text-center py-3 px-3 font-semibold text-slate-700 min-w-[90px]">Type</th>
                <th className={`text-right py-3 px-3 font-semibold min-w-[100px] ${confidence === 50 ? 'text-blue-700 bg-blue-50' : 'text-slate-500'}`}>P50</th>
                <th className={`text-right py-3 px-3 font-semibold min-w-[100px] ${confidence === 75 ? 'text-blue-700 bg-blue-50' : 'text-slate-500'}`}>P75</th>
                <th className={`text-right py-3 px-3 font-semibold min-w-[100px] ${confidence === 90 ? 'text-blue-700 bg-blue-50' : 'text-slate-500'}`}>P90</th>
                <th className="text-right py-3 px-3 font-semibold text-emerald-700 bg-emerald-50 min-w-[120px]">Target</th>
                <th className="text-right py-3 px-3 font-semibold text-purple-700 bg-purple-50 min-w-[100px]">Buffer</th>
              </tr>
            </thead>
            <tbody>
              {expenseGroups.map(group => {
                const groupCats = groupedAnalyses[group.id] || [];
                if (groupCats.length === 0) return null;
                const isCollapsed = collapsedGroups.has(group.id);
                const gt = groupTotals[group.id];

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
                      <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${confidence === 50 ? 'text-blue-700 bg-blue-50/50' : 'text-slate-500'}`}>
                        {formatCurrency(gt?.p50 || 0)}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${confidence === 75 ? 'text-blue-700 bg-blue-50/50' : 'text-slate-500'}`}>
                        {formatCurrency(gt?.p75 || 0)}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${confidence === 90 ? 'text-blue-700 bg-blue-50/50' : 'text-slate-500'}`}>
                        {formatCurrency(gt?.p90 || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 bg-emerald-50/50">
                        {formatCurrency(getGroupTargetForLevel(group.id))}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-purple-700 bg-purple-50/50">
                        {formatCurrency(gt?.buffer || 0)}
                      </td>
                    </tr>

                    {!isCollapsed && groupCats.map(a => {
                      const cat = categories.find(c => c.id === a.categoryId);
                      return (
                        <tr
                          key={a.categoryId}
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                          onClick={() => cat && onSelectCategory(cat)}
                        >
                          <td className="py-2 px-4 pl-10 text-slate-700 sticky left-0 bg-white">
                            <div className="flex items-center gap-2">
                              <span>{a.categoryName}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {a.isIrregular ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                                <Clock className="w-3 h-3" />
                                Sinking
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                                Regular
                              </span>
                            )}
                          </td>
                          <td className={`py-2 px-3 text-right ${confidence === 50 ? 'text-blue-700 bg-blue-50/30 font-medium' : 'text-slate-500'}`}>
                            {a.isIrregular ? <span className="text-slate-400">—</span> : formatCurrency(a.p50)}
                          </td>
                          <td className={`py-2 px-3 text-right ${confidence === 75 ? 'text-blue-700 bg-blue-50/30 font-medium' : 'text-slate-500'}`}>
                            {a.isIrregular ? <span className="text-slate-400">—</span> : formatCurrency(a.p75)}
                          </td>
                          <td className={`py-2 px-3 text-right ${confidence === 90 ? 'text-blue-700 bg-blue-50/30 font-medium' : 'text-slate-500'}`}>
                            {a.isIrregular ? <span className="text-slate-400">—</span> : formatCurrency(a.p90)}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-emerald-700 bg-emerald-50/30">
                            {formatCurrency(getTargetForLevel(a))}
                          </td>
                          <td className="py-2 px-3 text-right text-purple-700 bg-purple-50/30">
                            {a.bufferAmount > 0 ? formatCurrency(a.bufferAmount) : <span className="text-slate-400">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              <tr className="bg-slate-800 text-white font-semibold">
                <td className="py-3 px-4 sticky left-0 bg-slate-800">Total Monthly Budget</td>
                <td className="py-3 px-3"></td>
                <td className={`py-3 px-3 text-right ${confidence === 50 ? 'text-blue-300' : 'text-slate-400'}`}>
                  {formatCurrency(analysis.totalAtP50)}
                </td>
                <td className={`py-3 px-3 text-right ${confidence === 75 ? 'text-blue-300' : 'text-slate-400'}`}>
                  {formatCurrency(analysis.totalAtP75)}
                </td>
                <td className={`py-3 px-3 text-right ${confidence === 90 ? 'text-blue-300' : 'text-slate-400'}`}>
                  {formatCurrency(analysis.totalAtP90)}
                </td>
                <td className="py-3 px-3 text-right text-emerald-300">
                  {formatCurrency(totalAtLevel)}
                </td>
                <td className="py-3 px-3 text-right text-purple-300">
                  {formatCurrency(analysis.totalBuffer)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          <strong>How this works:</strong> Percentiles are calculated from your last 12 months of spending.
          The 50th percentile (median) is your lean budget. The 75th is a balanced target that covers most months.
          The 90th is your ceiling. Categories with 4+ zero-spending months are flagged as sinking funds and use
          an annual accrual approach instead. The buffer is the sum of all 75th-to-90th gaps — a single monthly
          amount to cover overages without touching savings.
        </p>
      </div>
    </div>
  );
}
