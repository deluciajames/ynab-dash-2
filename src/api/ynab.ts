const BASE_URL = 'https://api.ynab.com/v1';

export interface YnabBudgetSummary {
  id: string;
  name: string;
  last_modified_on: string;
  first_month: string;
  last_month: string;
}

export interface YnabCategoryGroup {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
}

export interface YnabCategory {
  id: string;
  category_group_id: string;
  category_group_name: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  budgeted: number;
  activity: number;
  balance: number;
  goal_type: string | null;
  goal_target: number | null;
  goal_cadence: number | null;
  goal_months_to_budget: number | null;
}

export interface YnabMonthDetail {
  month: string;
  income: number;
  budgeted: number;
  activity: number;
  categories: YnabCategory[];
}

async function ynabFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const detail = errorBody?.error?.detail || response.statusText;
    throw new Error(`YNAB API error (${response.status}): ${detail}`);
  }

  const json = await response.json();
  return json.data;
}

export async function fetchBudgets(token: string): Promise<YnabBudgetSummary[]> {
  const data = await ynabFetch<{ budgets: YnabBudgetSummary[] }>('/budgets', token);
  return data.budgets;
}

export async function fetchBudgetMonthsList(token: string, budgetId: string): Promise<{ month: string }[]> {
  const data = await ynabFetch<{ months: { month: string }[] }>(
    `/budgets/${budgetId}/months`,
    token
  );
  return data.months;
}

export async function fetchAllMonthDetails(
  token: string,
  budgetId: string,
  maxMonths: number = 12
): Promise<YnabMonthDetail[]> {
  const monthsList = await fetchBudgetMonthsList(token, budgetId);

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const validMonths = monthsList
    .map(m => m.month)
    .filter(m => m !== '0001-01-01' && m < currentMonthStr)
    .sort()
    .slice(-maxMonths);

  const details = await Promise.all(
    validMonths.map(month => fetchMonthDetail(token, budgetId, month))
  );

  return details;
}

export async function fetchMonthDetail(
  token: string,
  budgetId: string,
  month: string
): Promise<YnabMonthDetail> {
  const data = await ynabFetch<{ month: YnabMonthDetail }>(
    `/budgets/${budgetId}/months/${month}`,
    token
  );
  return data.month;
}

export async function fetchCategoryGroups(
  token: string,
  budgetId: string
): Promise<{ category_groups: YnabCategoryGroup[]; }> {
  const data = await ynabFetch<{ category_groups: YnabCategoryGroup[] }>(
    `/budgets/${budgetId}/categories`,
    token
  );
  return data;
}

export interface CategoryGoalInfo {
  goal_target: number | null;
  goal_type: string | null;
}

export type GoalMap = Record<string, CategoryGoalInfo>;

interface YnabCategoryGroupWithCategories {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  categories: Array<{
    id: string;
    hidden: boolean;
    deleted: boolean;
    goal_type: string | null;
    goal_target: number | null;
  }>;
}

export async function fetchCategoriesWithGoals(
  token: string,
  budgetId: string
): Promise<GoalMap> {
  const data = await ynabFetch<{ category_groups: YnabCategoryGroupWithCategories[] }>(
    `/budgets/${budgetId}/categories`,
    token
  );

  const goalMap: GoalMap = {};
  for (const group of data.category_groups) {
    if (!group.categories) continue;
    for (const cat of group.categories) {
      if (cat.hidden || cat.deleted) continue;
      if (cat.goal_target !== null && cat.goal_target !== undefined) {
        goalMap[cat.id] = {
          goal_target: cat.goal_target,
          goal_type: cat.goal_type,
        };
      }
    }
  }
  return goalMap;
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    await fetchBudgets(token);
    return true;
  } catch {
    return false;
  }
}
