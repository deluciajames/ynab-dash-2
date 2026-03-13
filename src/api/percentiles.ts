import type { Category, CategoryGroup } from './transform';

export interface CategoryAnalysis {
  categoryId: string;
  categoryName: string;
  groupId: string;
  isIrregular: boolean;
  zeroMonths: number;
  totalMonths: number;
  p50: number;
  p75: number;
  p90: number;
  sinkingFundMonthly: number;
  bufferAmount: number;
  recommendedTarget: number;
}

export interface BudgetAnalysis {
  categories: CategoryAnalysis[];
  totalAtP50: number;
  totalAtP75: number;
  totalAtP90: number;
  totalBuffer: number;
  totalSinkingFunds: number;
}

function calculatePercentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return Math.round(sortedValues[lower]);
  return Math.round(sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight);
}

const IRREGULAR_ZERO_THRESHOLD = 4;

export function analyzeCategory(
  category: Category,
  excludedMonths?: string[],
): CategoryAnalysis {
  const allValues = Object.values(category.monthlyData);
  const allAbsValues = allValues.map(v => Math.abs(v));
  const allTotalMonths = allAbsValues.length;
  const allZeroMonths = allAbsValues.filter(v => v === 0).length;
  const isIrregular = allZeroMonths >= IRREGULAR_ZERO_THRESHOLD;

  const excluded = new Set(excludedMonths || []);
  const filteredAbsValues = Object.entries(category.monthlyData)
    .filter(([month]) => !excluded.has(month))
    .map(([, v]) => Math.abs(v));
  const percentileSorted = [...filteredAbsValues].sort((a, b) => a - b);

  let p50 = 0;
  let p75 = 0;
  let p90 = 0;
  let sinkingFundMonthly = 0;
  let bufferAmount = 0;
  let recommendedTarget = 0;

  if (isIrregular) {
    const totalSpend = allAbsValues.reduce((sum, v) => sum + v, 0);
    const annualized = allTotalMonths >= 12 ? totalSpend : (totalSpend / (allTotalMonths || 1)) * 12;
    sinkingFundMonthly = Math.round(annualized / 12);
    p50 = calculatePercentile(percentileSorted, 50);
    p75 = calculatePercentile(percentileSorted, 75);
    p90 = calculatePercentile(percentileSorted, 90);
    recommendedTarget = sinkingFundMonthly;
  } else {
    p50 = calculatePercentile(percentileSorted, 50);
    p75 = calculatePercentile(percentileSorted, 75);
    p90 = calculatePercentile(percentileSorted, 90);
    bufferAmount = Math.max(0, p90 - p75);
    recommendedTarget = p75;
  }

  return {
    categoryId: category.id,
    categoryName: category.name,
    groupId: category.groupId,
    isIrregular,
    zeroMonths: allZeroMonths,
    totalMonths: allTotalMonths,
    p50,
    p75,
    p90,
    sinkingFundMonthly,
    bufferAmount,
    recommendedTarget,
  };
}

export function analyzeBudget(
  categories: Category[],
  _groups: CategoryGroup[],
  exclusionsMap?: Record<string, string[]>,
): BudgetAnalysis {
  const expenseCategories = categories.filter(c => c.type !== 'Income');

  const analyses = expenseCategories.map(cat =>
    analyzeCategory(cat, exclusionsMap?.[cat.id])
  );

  const regular = analyses.filter(a => !a.isIrregular);
  const irregular = analyses.filter(a => a.isIrregular);

  const totalAtP50 = regular.reduce((s, a) => s + a.p50, 0)
    + irregular.reduce((s, a) => s + a.sinkingFundMonthly, 0);

  const totalAtP75 = regular.reduce((s, a) => s + a.p75, 0)
    + irregular.reduce((s, a) => s + a.sinkingFundMonthly, 0);

  const totalAtP90 = regular.reduce((s, a) => s + a.p90, 0)
    + irregular.reduce((s, a) => s + a.sinkingFundMonthly, 0);

  const totalBuffer = regular.reduce((s, a) => s + a.bufferAmount, 0);

  const totalSinkingFunds = irregular.reduce((s, a) => s + a.sinkingFundMonthly, 0);

  return {
    categories: analyses,
    totalAtP50,
    totalAtP75,
    totalAtP90,
    totalBuffer,
    totalSinkingFunds,
  };
}
