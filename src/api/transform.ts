import type { YnabMonthDetail } from './ynab';

export interface Category {
  id: string;
  name: string;
  groupId: string;
  type: 'Income' | 'Expense' | 'Savings' | 'Credit Card';
  monthlyData: Record<string, number>;
  average: number;
  total: number;
  ynabTarget: number | null;
  goalType: string | null;
}

export interface CategoryGroup {
  id: string;
  name: string;
  emoji: string;
  isIncome: boolean;
}

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
    ynabTarget: number | null;
    goalType: string | null;
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
          ynabTarget: null,
          goalType: null,
        });
      }

      const catData = categoryDataMap.get(cat.id)!;
      const amount = cat.activity / 1000;
      catData.monthlyData[formattedMonth] = amount;

      // Always overwrite with the latest month's goal data (months are sorted chronologically)
      if (cat.goal_target !== null && cat.goal_target !== undefined) {
        catData.ynabTarget = cat.goal_target / 1000;
        catData.goalType = cat.goal_type;
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

    categories.push({
      id,
      name: catData.name,
      groupId: catData.groupId,
      type,
      monthlyData: catData.monthlyData,
      average,
      total,
      ynabTarget: catData.ynabTarget,
      goalType: catData.goalType,
    });
  }

  return { categories, groups, availableMonths };
}
