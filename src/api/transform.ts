import type { YnabMonthDetail } from './ynab';

export interface Category {
  id: string;
  name: string;
  groupId: string;
  type: 'Income' | 'Expense' | 'Savings' | 'Credit Card';
  frequency: 'Fixed' | 'Flexible' | 'Monthly' | 'Annual' | 'Ad-Hoc';
  monthlyData: Record<string, number>;
  average: number;
  total: number;
  target: number;
  forecasted: Record<string, number>;
}

export interface CategoryGroup {
  id: string;
  name: string;
  emoji: string;
  isIncome: boolean;
}

const monthAbbreviations = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

interface PrefixAnalysis {
  frequency: 'Fixed' | 'Flexible' | 'Monthly' | 'Annual' | 'Ad-Hoc';
  targetOverride: number | null;
  isCompleted: boolean;
}

const getMostRecentOrMode = (monthlyData: Record<string, number>): number => {
  const entries = Object.entries(monthlyData);
  const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  entries.sort((a, b) => {
    const [monthA, yearA] = a[0].split(' ');
    const [monthB, yearB] = b[0].split(' ');
    if (yearA !== yearB) return parseInt(yearA) - parseInt(yearB);
    return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
  });

  for (let i = entries.length - 1; i >= 0; i--) {
    const value = Math.abs(entries[i][1]);
    if (value > 0) {
      return Math.round(value);
    }
  }

  const nonZeroValues = entries.map(e => Math.abs(e[1])).filter(v => v > 0);
  if (nonZeroValues.length === 0) return 0;

  const frequency: Record<number, number> = {};
  let maxFreq = 0;
  let mode = nonZeroValues[0];

  for (const val of nonZeroValues) {
    const rounded = Math.round(val);
    frequency[rounded] = (frequency[rounded] || 0) + 1;
    if (frequency[rounded] > maxFreq) {
      maxFreq = frequency[rounded];
      mode = rounded;
    }
  }

  return mode;
};

const analyzeCategoryPrefix = (name: string, monthlyData: Record<string, number>): PrefixAnalysis => {
  if (/^\[x\]/i.test(name)) {
    return { frequency: 'Monthly', targetOverride: 0, isCompleted: true };
  }

  if (name.includes('✅')) {
    return { frequency: 'Monthly', targetOverride: 0, isCompleted: true };
  }

  const monthMatch = name.match(/^\[([A-Za-z]{3})\]/);
  if (monthMatch && monthAbbreviations.includes(monthMatch[1].toUpperCase())) {
    const values = Object.values(monthlyData).map(Math.abs).filter(v => v > 0);
    const annualCharge = values.length > 0 ? Math.max(...values) : 0;
    const monthlyTarget = Math.round(annualCharge / 12);
    return { frequency: 'Annual', targetOverride: monthlyTarget, isCompleted: false };
  }

  const numberMatch = name.match(/^\[(\d+)\]/);
  if (numberMatch) {
    const target = getMostRecentOrMode(monthlyData);
    return { frequency: 'Monthly', targetOverride: target, isCompleted: false };
  }

  if (/^\[Flex\]/i.test(name)) {
    return { frequency: 'Flexible', targetOverride: null, isCompleted: false };
  }

  if (/^\[E\d+Y\]/i.test(name)) {
    const values = Object.values(monthlyData).map(Math.abs).filter(v => v > 0);
    const annualCharge = values.length > 0 ? Math.max(...values) : 0;
    const monthlyTarget = Math.round(annualCharge / 12);
    return { frequency: 'Annual', targetOverride: monthlyTarget, isCompleted: false };
  }

  return { frequency: 'Monthly', targetOverride: null, isCompleted: false };
};

function formatYnabMonth(isoMonth: string): string {
  const date = new Date(isoMonth + 'T00:00:00');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

const INTERNAL_GROUP_NAMES = [
  'Internal Master Category',
  'Credit Card Payments',
  'Hidden Categories',
];

export function transformYnabData(months: YnabMonthDetail[]): {
  categories: Category[];
  groups: CategoryGroup[];
  availableMonths: string[];
} {
  const sortedMonths = [...months]
    .filter(m => m.month !== '0001-01-01')
    .sort((a, b) => a.month.localeCompare(b.month));

  const availableMonths = sortedMonths.map(m => formatYnabMonth(m.month));

  const groupMap = new Map<string, { name: string; isIncome: boolean }>();
  const categoryDataMap = new Map<string, {
    name: string;
    groupId: string;
    groupName: string;
    monthlyData: Record<string, number>;
    goalTarget: number | null;
    goalType: string | null;
    goalCadence: number | null;
  }>();

  for (const monthDetail of sortedMonths) {
    const formattedMonth = formatYnabMonth(monthDetail.month);

    for (const cat of monthDetail.categories) {
      if (cat.hidden || cat.deleted) continue;
      if (INTERNAL_GROUP_NAMES.some(n => cat.category_group_name === n)) continue;

      if (!groupMap.has(cat.category_group_id)) {
        groupMap.set(cat.category_group_id, {
          name: cat.category_group_name,
          isIncome: cat.category_group_name === 'Inflow: Ready to Assign' ||
                    cat.category_group_name.toLowerCase().includes('income'),
        });
      }

      if (!categoryDataMap.has(cat.id)) {
        categoryDataMap.set(cat.id, {
          name: cat.name,
          groupId: cat.category_group_id,
          groupName: cat.category_group_name,
          monthlyData: {},
          goalTarget: null,
          goalType: null,
          goalCadence: null,
        });
      }

      const catData = categoryDataMap.get(cat.id)!;
      const amount = cat.activity / 1000;
      catData.monthlyData[formattedMonth] = amount;

      if (cat.goal_target != null) {
        catData.goalTarget = cat.goal_target;
        catData.goalType = cat.goal_type;
        catData.goalCadence = cat.goal_cadence;
      }
    }
  }

  const groups: CategoryGroup[] = [];
  const emojiForGroup = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('income') || lower.includes('inflow')) return '💵';
    if (lower.includes('home') || lower.includes('housing') || lower.includes('rent')) return '🏡';
    if (lower.includes('food') || lower.includes('dining') || lower.includes('grocery')) return '🍽️';
    if (lower.includes('transport') || lower.includes('car') || lower.includes('auto')) return '🚗';
    if (lower.includes('subscription') || lower.includes('software')) return '📲';
    if (lower.includes('health') || lower.includes('medical')) return '🏥';
    if (lower.includes('entertainment') || lower.includes('fun')) return '🎮';
    if (lower.includes('saving') || lower.includes('invest')) return '💰';
    if (lower.includes('education') || lower.includes('learn')) return '📚';
    if (lower.includes('gift') || lower.includes('charity')) return '🎁';
    if (lower.includes('travel') || lower.includes('vacation')) return '✈️';
    if (lower.includes('pet')) return '🐾';
    if (lower.includes('cloth') || lower.includes('shopping')) return '🛍️';
    if (lower.includes('utility') || lower.includes('utilities')) return '⚡';
    return '📁';
  };

  for (const [id, data] of groupMap) {
    groups.push({
      id,
      name: data.name,
      emoji: emojiForGroup(data.name),
      isIncome: data.isIncome,
    });
  }

  const categories: Category[] = [];

  for (const [id, catData] of categoryDataMap) {
    const values = Object.values(catData.monthlyData);
    const total = values.reduce((a, b) => a + b, 0);
    const average = values.length > 0 ? total / values.length : 0;

    const groupInfo = groupMap.get(catData.groupId);
    const isIncomeGroup = groupInfo?.isIncome ?? false;

    const type: Category['type'] = isIncomeGroup
      ? 'Income'
      : (catData.name.toLowerCase().includes('saving') || catData.name.toLowerCase().includes('invest'))
        ? 'Savings'
        : 'Expense';

    const prefixAnalysis = analyzeCategoryPrefix(catData.name, catData.monthlyData);

    let target: number;
    let frequency = prefixAnalysis.frequency;

    if (catData.goalTarget != null && catData.goalTarget > 0) {
      const goalAmountDollars = catData.goalTarget / 1000;
      const cadence = catData.goalCadence ?? 1;
      if (cadence > 1) {
        target = Math.round(goalAmountDollars / cadence);
        frequency = 'Annual';
      } else {
        target = Math.round(goalAmountDollars);
      }
    } else if (prefixAnalysis.targetOverride !== null) {
      target = prefixAnalysis.targetOverride;
    } else {
      target = Math.round(Math.abs(average));
    }

    categories.push({
      id,
      name: catData.name,
      groupId: catData.groupId,
      type,
      frequency,
      monthlyData: catData.monthlyData,
      average,
      total,
      target,
      forecasted: {},
    });
  }

  return { categories, groups, availableMonths };
}
