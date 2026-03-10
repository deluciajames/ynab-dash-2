import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, Shield, Clock, TrendingUp, Lock, Unlock } from 'lucide-react';
import type { Category, CategoryGroup } from '../api/transform';
import { analyzeBudget, type CategoryAnalysis } from '../api/percentiles';
import { applySortOrder } from '../hooks/useGroupSortOrder';
import type { OverridesMap, CategoryOverride } from '../hooks/useCategoryOverrides';

type ConfidenceLevel = 50 | 75 | 90;

interface TargetCalculatorProps {
  categories: Category[];
  groups: CategoryGroup[];
  groupSortOrder: string[];
  overrides: OverridesMap;
  onSetOverride: (categoryId: string, override: Partial<CategoryOverride>) => void;
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

function TargetControls({
  analysis,
  effectiveTarget,
  isLocked,
  onSave,
  onToggleLock,
  selectedPercentile,
}: {
  analysis: CategoryAnalysis;
  effectiveTarget: number;
  isLocked: boolean;
  onSave: (val: number, percentile?: 50 | 75 | 90) => void;
  onToggleLock: () => void;
  selectedPercentile: ConfidenceLevel | null;
}) {
  const getPercentileValue = (p: 50 | 75 | 90): number => {
    if (analysis.isIrregular) return analysis.sinkingFundMonthly;
    return p === 50 ? analysis.p50 : p === 75 ? analysis.p75 : analysis.p90;
  };

  const activePercentile = selectedPercentile ?? (
    !analysis.isIrregular
      ? ([50, 75, 90] as const).find(
          p => Math.round(effectiveTarget) === Math.round(getPercentileValue(p))
        ) ?? null
      : null
  );

  return (
    <td className="py-2 px-1" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 justify-start">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
          className={`p-0.5 transition-colors ${
            isLocked
              ? 'text-amber-500 hover:text-amber-600'
              : 'text-slate-300 hover:text-slate-400'
          }`}
          title={isLocked ? 'Unlock (will follow confidence toggle)' : 'Value follows confidence toggle'}
        >
          {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
        <div className="flex bg-slate-100 rounded p-0.5">
          {([50, 75, 90] as const).map(p => (
            <button
              key={p}
              onClick={(e) => {
                e.stopPropagation();
                onSave(getPercentileValue(p), p);
              }}
              className={`px-1.5 py-0.5 text-[10px] font-semibold rounded transition-all ${
                activePercentile === p
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title={`Set to P${p}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
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
}: TargetCalculatorProps) {
  const [confidence, setConfidenceState] = useState<ConfidenceLevel>(75);

  const setConfidence = (level: ConfidenceLevel) => {
    setConfidenceState(level);
    for (const a of analysis.categories) {
      const ov = overrides[a.categoryId];
      if (ov && !ov.lockedTarget && ov.target !== undefined) {
        onSetOverride(a.categoryId, { target: undefined, targetPercentile: undefined });
      }
    }
  };
  const [takeHome, setTakeHome] = useState<number | null>(null);
  const [takeHomeInput, setTakeHomeInput] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const analysis = useMemo(
    () => analyzeBudget(categories, groups),
    [categories, groups]
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

  const getBaseTarget = (a: CategoryAnalysis): number => {
    if (a.isIrregular) return a.sinkingFundMonthly;
    return confidence === 50 ? a.p50 : confidence === 75 ? a.p75 : a.p90;
  };

  const getBaseBuffer = (a: CategoryAnalysis): number => {
    if (a.isIrregular) return 0;
    if (confidence === 90) return 0;
    const base = confidence === 50 ? a.p50 : a.p75;
    return Math.max(0, a.p90 - base);
  };

  const getEffectiveTarget = (a: CategoryAnalysis): number => {
    const ov = overrides[a.categoryId];
    if (ov?.target !== undefined) return ov.target;
    return getBaseTarget(a);
  };

  const getEffectiveBuffer = (a: CategoryAnalysis): number => {
    const ov = overrides[a.categoryId];
    if (ov?.buffer !== undefined) return ov.buffer;
    return getBaseBuffer(a);
  };

  const groupTotals = useMemo(() => {
    const totals: Record<string, { target: number; buffer: number; p50: number; p75: number; p90: number }> = {};
    for (const g of expenseGroups) {
      const cats = groupedAnalyses[g.id] || [];
      totals[g.id] = {
        target: cats.reduce((s, a) => s + getEffectiveTarget(a), 0),
        buffer: cats.reduce((s, a) => s + getEffectiveBuffer(a), 0),
        p50: cats.reduce((s, a) => s + (a.isIrregular ? a.sinkingFundMonthly : a.p50), 0),
        p75: cats.reduce((s, a) => s + (a.isIrregular ? a.sinkingFundMonthly : a.p75), 0),
        p90: cats.reduce((s, a) => s + (a.isIrregular ? a.sinkingFundMonthly : a.p90), 0),
      };
    }
    return totals;
  }, [groupedAnalyses, expenseGroups, confidence, overrides]);

  const totalTarget = useMemo(() => {
    return Object.values(groupTotals).reduce((s, g) => s + g.target, 0);
  }, [groupTotals]);

  const totalBuffer = useMemo(() => {
    return Object.values(groupTotals).reduce((s, g) => s + g.buffer, 0);
  }, [groupTotals]);

  const totalBudget = totalTarget + totalBuffer;
  const overBudget = takeHome !== null && totalBudget > takeHome;
  const remaining = takeHome !== null ? takeHome - totalBudget : null;

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

  const handleTargetSave = (categoryId: string, val: number, percentile?: 50 | 75 | 90) => {
    onSetOverride(categoryId, { target: val, lockedTarget: true, targetPercentile: percentile });
  };

  const handleBufferSave = (categoryId: string, val: number) => {
    onSetOverride(categoryId, { buffer: val, lockedBuffer: false });
  };

  const handleToggleTargetLock = (categoryId: string, currentValue: number) => {
    const ov = overrides[categoryId];
    if (ov?.lockedTarget) {
      onSetOverride(categoryId, { lockedTarget: false });
    } else {
      onSetOverride(categoryId, { lockedTarget: true, target: currentValue });
    }
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
          <div className="text-3xl font-bold text-slate-900">{formatCurrency(totalTarget)}</div>
          <p className="text-xs text-slate-500 mt-1">Sum of all category targets</p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-slate-600">Total Buffer</span>
          </div>
          <div className="text-3xl font-bold text-purple-700">{formatCurrency(totalBuffer)}</div>
          <p className="text-xs text-slate-500 mt-1">
            {confidence === 90 ? 'No buffer at 90th percentile' : `Gap to 90th from ${confidence}th percentile`}
          </p>
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
                <th className="text-left py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[250px]">Category</th>
                <th className="text-right py-3 px-2 font-semibold text-emerald-700 bg-emerald-50 min-w-[80px]">Target</th>
                <th className="py-3 px-1 bg-emerald-50 w-[90px]"></th>
                <th className="text-right py-3 px-2 font-semibold text-purple-700 bg-purple-50 min-w-[80px]">Buffer</th>
                <th className="text-center py-3 px-3 font-semibold text-slate-700 min-w-[80px]">Type</th>
                <th className={`text-right py-3 px-3 font-semibold min-w-[90px] ${confidence === 50 ? 'text-blue-700 bg-blue-50' : 'text-slate-500'}`}>P50</th>
                <th className={`text-right py-3 px-3 font-semibold min-w-[90px] ${confidence === 75 ? 'text-blue-700 bg-blue-50' : 'text-slate-500'}`}>P75</th>
                <th className={`text-right py-3 px-3 font-semibold min-w-[90px] ${confidence === 90 ? 'text-blue-700 bg-blue-50' : 'text-slate-500'}`}>P90</th>
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
                      <td className="py-2.5 px-2 text-right font-semibold text-emerald-700 bg-emerald-50/50">
                        {formatCurrency(gt?.target || 0)}
                      </td>
                      <td className="py-2.5 px-1 bg-emerald-50/50"></td>
                      <td className="py-2.5 px-2 text-right font-semibold text-purple-700 bg-purple-50/50">
                        {formatCurrency(gt?.buffer || 0)}
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
                    </tr>

                    {!isCollapsed && groupCats.map(a => {
                      const cat = categories.find(c => c.id === a.categoryId);
                      const effectiveTarget = getEffectiveTarget(a);
                      const effectiveBuffer = getEffectiveBuffer(a);
                      const ov = overrides[a.categoryId];
                      const isTargetLocked = !!(ov?.lockedTarget);


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
                          <ValueCell
                            value={effectiveTarget}
                            onSave={(val) => handleTargetSave(a.categoryId, val, undefined)}
                            colorClass="text-emerald-700"
                            bgClass="bg-emerald-50/30"
                          />
                          <TargetControls
                            analysis={a}
                            effectiveTarget={effectiveTarget}
                            isLocked={isTargetLocked}
                            onSave={(val, p) => handleTargetSave(a.categoryId, val, p)}
                            onToggleLock={() => handleToggleTargetLock(a.categoryId, effectiveTarget)}
                            selectedPercentile={ov?.targetPercentile ?? null}
                          />
                          <ValueCell
                            value={effectiveBuffer}
                            onSave={(val) => handleBufferSave(a.categoryId, val)}
                            colorClass="text-purple-700"
                            bgClass="bg-purple-50/30"
                          />
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
                <td className="py-3 px-1"></td>
                <td className="py-3 px-2 text-right text-purple-300">
                  {formatCurrency(totalBuffer)}
                </td>
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
          an annual accrual approach instead. Click any Target or Buffer value to edit it — edited values show a
          locked icon and won't change when you switch confidence levels. Click the lock to unlock and follow the
          master toggle again. Use the small 50/75/90 buttons to quickly set a specific percentile for individual categories.
        </p>
      </div>
    </div>
  );
}
