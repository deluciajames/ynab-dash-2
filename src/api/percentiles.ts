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
): CategoryAnalysis {
  const values = Object.values(category.monthlyData);
  const absValues = values.map(v => Math.abs(v));
  const totalMonths = absValues.length;
  const zeroMonths = absValues.filter(v => v === 0).length;
  const isIrregular = zeroMonths >= IRREGULAR_ZERO_THRESHOLD;

  const allValuesSorted = [...absValues].sort((a, b) => a - b);

  let p50 = 0;
  let p75 = 0;
  let p90 = 0;
  let sinkingFundMonthly = 0;
  let bufferAmount = 0;
  let recommendedTarget = 0;

  if (isIrregular) {
    const totalSpend = absValues.reduce((sum, v) => sum + v, 0);
    const annualized = totalMonths >= 12 ? totalSpend : (totalSpend / (totalMonths || 1)) * 12;
    sinkingFundMonthly = Math.round(annualized / 12);
    p50 = calculatePercentile(allValuesSorted, 50);
    p75 = calculatePercentile(allValuesSorted, 75);
    p90 = calculatePercentile(allValuesSorted, 90);
    recommendedTarget = sinkingFundMonthly;
  } else {
    p50 = calculatePercentile(allValuesSorted, 50);
    p75 = calculatePercentile(allValuesSorted, 75);
    p90 = calculatePercentile(allValuesSorted, 90);
    bufferAmount = Math.max(0, p90 - p75);
    recommendedTarget = p75;
  }

  return {
    categoryId: category.id,
    categoryName: category.name,
    groupId: category.groupId,
    isIrregular,
    zeroMonths,
    totalMonths,
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
): BudgetAnalysis {
  const expenseCategories = categories.filter(c => c.type !== 'Income');

  const analyses = expenseCategories.map(cat => analyzeCategory(cat));

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
