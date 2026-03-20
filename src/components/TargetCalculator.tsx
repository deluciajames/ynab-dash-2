import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, TrendingUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Category, CategoryGroup } from '../api/transform';
import { analyzeBudget, simulateCoverage, type CategoryAnalysis, type CoverageResult } from '../api/percentiles';
import { applySortOrder } from '../hooks/useGroupSortOrder';
import type { OverridesMap, CategoryOverride } from '../hooks/useCategoryOverrides';

interface TargetCalculatorProps {
  categories: Category[];
  groups: CategoryGroup[];
  groupSortOrder: string[];
  overrides: OverridesMap;
  onSetOverride: (categoryId: string, override: Partial<CategoryOverride>) => void;
  onSelectCategory: (category: Category) => void;
  takeHome: number | null;
  takeHomeInput: string;
  onTakeHomeChange: (value: string) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function ValueCell({
  value,
  onSave,
  colorClass,
  bgClass,
}: {
  value: number;
  onSave: (val: number) => void;
  colorClass: string;
  bgClass: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(String(Math.round(value)));
    setEditing(true);
  };

  const handleSave = () => {
    const num = parseFloat(editValue);
    if (!isNaN(num) && num >= 0) {
      onSave(Math.round(num));
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <td className={`py-1 px-2 ${bgClass}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1 justify-end">
          <span className="text-xs text-slate-400">$</span>
          <input
            ref={inputRef}
            type="number"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-20 px-1.5 py-1 text-right text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </td>
    );
  }

  return (
    <td className={`py-2 px-2 ${bgClass}`} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-end">
        <span
          className={`font-medium cursor-pointer hover:underline ${colorClass}`}
          onClick={handleStartEdit}
        >
          {formatCurrency(value)}
        </span>
      </div>
    </td>
  );
}

function CoverageBadge({ coverage }: { coverage: CoverageResult }) {
  if (coverage.totalMonths === 0) return <td className="py-2 px-3 text-center text-slate-400">—</td>;

  const ratio = coverage.coveredMonths / coverage.totalMonths;
  let colorClass: string;
  let bgClass: string;
  let Icon: typeof CheckCircle2;

  if (ratio >= 1) {
    colorClass = 'text-emerald-700';
    bgClass = 'bg-emerald-50';
    Icon = CheckCircle2;
  } else if (ratio >= 0.75) {
    colorClass = 'text-amber-700';
    bgClass = 'bg-amber-50';
    Icon = AlertCircle;
  } else {
    colorClass = 'text-red-700';
    bgClass = 'bg-red-50';
    Icon = AlertTriangle;
  }

  return (
    <td className="py-2 px-3">
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${colorClass} ${bgClass}`}>
        <Icon className="w-3 h-3" />
        <span>{coverage.coveredMonths}/{coverage.totalMonths} mo</span>
      </div>
      {coverage.maxShortfall > 0 && (
        <div className="text-[10px] text-slate-400 mt-0.5">
          worst: -{formatCurrency(coverage.maxShortfall)}
        </div>
      )}
    </td>
  );
}

function SpendingRange({ analysis }: { analysis: CategoryAnalysis }) {
  if (analysis.isIrregular) {
    return (
      <td className="py-2 px-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
          <Clock className="w-3 h-3" />
          Sinking
        </span>
      </td>
    );
  }

  const { min, max } = analysis.spendingRange;
  if (min === 0 && max === 0) return <td className="py-2 px-3 text-slate-400">—</td>;

  return (
    <td className="py-2 px-3 text-xs text-slate-500">
      {formatCurrency(min)} – {formatCurrency(max)}
    </td>
  );
}

export function TargetCalculator({
  categories,
  groups,
  groupSortOrder,
  overrides,
  onSetOverride,
  onSelectCategory,
  takeHome,
  takeHomeInput,
  onTakeHomeChange,
}: TargetCalculatorProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const exclusionsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [catId, ov] of Object.entries(overrides)) {
      if (ov.excludedMonths && ov.excludedMonths.length > 0) {
        map[catId] = ov.excludedMonths;
      }
    }
    return map;
  }, [overrides]);

  const analysis = useMemo(
    () => analyzeBudget(categories, groups, exclusionsMap),
    [categories, groups, exclusionsMap]
  );

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

  // Get the effective target: user override > YNAB target > recommended (p75 / sinking fund)
  const getEffectiveTarget = (a: CategoryAnalysis): number => {
    const ov = overrides[a.categoryId];
    if (ov?.target !== undefined) return ov.target;
    const cat = categories.find(c => c.id === a.categoryId);
    if (cat?.ynabTarget !== null && cat?.ynabTarget !== undefined && cat.ynabTarget > 0) {
      return Math.round(cat.ynabTarget);
    }
    return a.recommendedTarget;
  };

  // Compute coverage for each category
  const coverageMap = useMemo(() => {
    const map: Record<string, CoverageResult> = {};
    for (const a of analysis.categories) {
      const target = getEffectiveTarget(a);
      const cat = categories.find(c => c.id === a.categoryId);
      if (cat) {
        map[a.categoryId] = simulateCoverage(
          cat.monthlyData,
          target,
          exclusionsMap[a.categoryId],
        );
      }
    }
    return map;
  }, [analysis, categories, overrides, exclusionsMap]);

  const groupTotals = useMemo(() => {
    const totals: Record<string, { target: number }> = {};
    for (const g of expenseGroups) {
      const cats = groupedAnalyses[g.id] || [];
      totals[g.id] = {
        target: cats.reduce((s, a) => s + getEffectiveTarget(a), 0),
      };
    }
    return totals;
  }, [groupedAnalyses, expenseGroups, overrides, categories]);

  const totalTarget = useMemo(() => {
    return Object.values(groupTotals).reduce((s, g) => s + g.target, 0);
  }, [groupTotals]);

  const overBudget = takeHome !== null && totalTarget > takeHome;
  const remaining = takeHome !== null ? takeHome - totalTarget : null;

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleTargetSave = (categoryId: string, val: number) => {
    onSetOverride(categoryId, { target: val });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Monthly Take-Home</label>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-sm">$</span>
            <input
              type="number"
              value={takeHomeInput}
              onChange={(e) => onTakeHomeChange(e.target.value)}
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
            Your budget ({formatCurrency(totalTarget)}) exceeds your take-home ({formatCurrency(takeHome!)}) by{' '}
            <span className="font-semibold">{formatCurrency(totalTarget - takeHome!)}</span>.
            Consider reducing targets in categories where coverage is strong.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-slate-600">Monthly Budget</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{formatCurrency(totalTarget)}</div>
          <p className="text-xs text-slate-500 mt-1">Sum of all category targets</p>
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
            {remaining === null ? 'Enter take-home to see' : 'After all category targets'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[250px]">Category</th>
                <th className="text-right py-3 px-2 font-semibold text-emerald-700 bg-emerald-50 min-w-[100px]">Target</th>
                <th className="text-left py-3 px-3 font-semibold text-slate-700 min-w-[120px]">Typical Range</th>
                <th className="text-left py-3 px-3 font-semibold text-slate-700 min-w-[130px]">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {expenseGroups.map(group => {
                const groupCats = groupedAnalyses[group.id] || [];
                if (groupCats.length === 0) return null;
                const isCollapsed = collapsedGroups.has(group.id);
                const gt = groupTotals[group.id];

                // Aggregate coverage for group
                const groupCoveredMonths = groupCats.reduce((s, a) => {
                  const c = coverageMap[a.categoryId];
                  return s + (c ? c.coveredMonths : 0);
                }, 0);
                const groupTotalMonths = groupCats.reduce((s, a) => {
                  const c = coverageMap[a.categoryId];
                  return s + (c ? c.totalMonths : 0);
                }, 0);

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
                      <td className="py-2.5 px-2 text-right font-semibold text-emerald-700 bg-emerald-50/50">
                        {formatCurrency(gt?.target || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">—</td>
                      <td className="py-2.5 px-3">
                        {groupTotalMonths > 0 && (
                          <span className="text-xs text-slate-500">
                            {groupCoveredMonths}/{groupTotalMonths} mo across categories
                          </span>
                        )}
                      </td>
                    </tr>

                    {!isCollapsed && groupCats.map(a => {
                      const cat = categories.find(c => c.id === a.categoryId);
                      const effectiveTarget = getEffectiveTarget(a);
                      const coverage = coverageMap[a.categoryId];

                      return (
                        <tr
                          key={a.categoryId}
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                          onClick={() => cat && onSelectCategory(cat)}
                        >
                          <td className="py-2 px-4 pl-10 text-slate-700 sticky left-0 bg-white">
                            <div className="flex items-center gap-2">
                              <span>{a.categoryName}</span>
                              {cat?.ynabTarget !== null && cat?.ynabTarget !== undefined && cat.ynabTarget > 0 && !overrides[a.categoryId]?.target && (
                                <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded font-medium">YNAB</span>
                              )}
                            </div>
                          </td>
                          <ValueCell
                            value={effectiveTarget}
                            onSave={(val) => handleTargetSave(a.categoryId, val)}
                            colorClass="text-emerald-700"
                            bgClass="bg-emerald-50/30"
                          />
                          <SpendingRange analysis={a} />
                          {coverage ? (
                            <CoverageBadge coverage={coverage} />
                          ) : (
                            <td className="py-2 px-3 text-slate-400">—</td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              <tr className="bg-slate-800 text-white font-semibold">
                <td className="py-3 px-4 sticky left-0 bg-slate-800">Total Monthly Budget</td>
                <td className="py-3 px-2 text-right text-emerald-300">
                  {formatCurrency(totalTarget)}
                </td>
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          <strong>How this works:</strong> Targets are pulled from your YNAB budget goals. If no goal is set,
          a recommended target is calculated from your spending history. The <strong>Coverage</strong> column
          simulates your target against your actual spending — it shows how many months your target would have
          covered, accounting for rollover from underspending months. Click any target to edit it.
          Click a category row to see detailed monthly spending.
        </p>
      </div>
    </div>
  );
}
