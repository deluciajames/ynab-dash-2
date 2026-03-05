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

export async function fetchBudgetMonths(token: string, budgetId: string): Promise<YnabMonthDetail[]> {
  const data = await ynabFetch<{ months: YnabMonthDetail[] }>(
    `/budgets/${budgetId}/months`,
    token
  );
  return data.months;
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

export async function validateToken(token: string): Promise<boolean> {
  try {
    await fetchBudgets(token);
    return true;
  } catch {
    return false;
  }
}
