import type { YnabMonthDetail, GoalMap, YnabCategory } from "./ynab";

export interface GoalDetails {
  type: string | null;
  target: number | null;
  cadence: number | null;
  frequency: number | null;
  day: number | null;
  dueDate: string | null;
  monthsToBudget: number | null;
  funded: number | null;
  remaining: number | null;
  needsWholeAmount: boolean | null;
}
export interface Category {
  id: string;
  name: string;
  groupId: string;
  type: "Income" | "Expense" | "Savings" | "Credit Card";
  monthlyData: Record<string, number>;
  average: number;
  total: number;
  ynabTarget: number | null;
  goalType: string | null;
  goal: GoalDetails | null;
  balance: number;
  hidden: boolean;
}
export interface CategoryGroup {
  id: string;
  name: string;
  emoji: string;
  isIncome: boolean;
}
const INTERNAL_GROUP_NAMES = [
  "Internal Master Category",
  "Credit Card Payments",
];
const dollars = (value: number | null | undefined) =>
  value == null ? null : value / 1000;
function goalDetails(cat: YnabCategory): GoalDetails | null {
  if (!cat.goal_type) return null;
  return {
    type: cat.goal_type,
    target: dollars(cat.goal_target),
    cadence: cat.goal_cadence ?? null,
    frequency: cat.goal_cadence_frequency ?? null,
    day: cat.goal_day ?? null,
    dueDate: cat.goal_target_date ?? cat.goal_target_month ?? null,
    monthsToBudget: cat.goal_months_to_budget ?? null,
    funded: dollars(cat.goal_overall_funded),
    remaining: dollars(cat.goal_overall_left),
    needsWholeAmount: cat.goal_needs_whole_amount ?? null,
  };
}
export function transformYnabData(
  months: YnabMonthDetail[],
  goalMap: GoalMap = {},
) {
  const sorted = [...months]
    .filter((m) => m.month !== "0001-01-01")
    .sort((a, b) => a.month.localeCompare(b.month));
  const groups = new Map<string, CategoryGroup>();
  const categories = new Map<string, Category>();
  function ensure(cat: YnabCategory) {
    if (cat.deleted || INTERNAL_GROUP_NAMES.includes(cat.category_group_name))
      return null;
    const isIncome =
      cat.category_group_name === "Inflow: Ready to Assign" ||
      cat.name === "Inflow: Ready to Assign";
    if (!groups.has(cat.category_group_id))
      groups.set(cat.category_group_id, {
        id: cat.category_group_id,
        name: cat.category_group_name,
        emoji: "",
        isIncome,
      });
    if (!categories.has(cat.id))
      categories.set(cat.id, {
        id: cat.id,
        name: cat.name,
        groupId: cat.category_group_id,
        type: isIncome ? "Income" : "Expense",
        monthlyData: {},
        average: 0,
        total: 0,
        ynabTarget: null,
        goalType: null,
        goal: null,
        balance: 0,
        hidden: cat.hidden,
      });
    return categories.get(cat.id)!;
  }
  for (const month of sorted)
    for (const cat of month.categories) {
      const item = ensure({
        ...cat,
        category_group_name:
          cat.category_group_name ||
          goalMap[cat.id]?.category_group_name ||
          "Archived categories",
      });
      if (item) item.monthlyData[month.month] = cat.activity / 1000;
    }
  // Current category metadata controls targets, grouping and names; historical goals can be stale.
  for (const cat of Object.values(goalMap)) {
    const item = ensure(cat);
    if (!item) continue;
    groups.set(cat.category_group_id, {
      id: cat.category_group_id,
      name: cat.category_group_name,
      emoji: "",
      isIncome:
        cat.category_group_name === "Inflow: Ready to Assign" ||
        cat.name === "Inflow: Ready to Assign",
    });
    item.name = cat.name;
    item.groupId = cat.category_group_id;
    item.hidden = cat.hidden;
    item.balance = cat.balance / 1000;
    item.goal = goalDetails(cat);
    item.ynabTarget = dollars(cat.goal_target);
    item.goalType = cat.goal_type;
    if (cat.goal_type === "MF" || cat.goal_type === "TB") item.type = "Savings";
  }
  for (const item of categories.values()) {
    const vals = Object.values(item.monthlyData);
    item.total = vals.reduce((s, n) => s - n, 0);
    item.average = vals.length ? item.total / vals.length : 0;
  }
  return {
    categories: [...categories.values()],
    groups: [...groups.values()].sort((a, b) => {
      const order = [
        ...new Set(Object.values(goalMap).map((c) => c.category_group_id)),
      ];
      const ai = order.indexOf(a.id),
        bi = order.indexOf(b.id);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || 0;
    }),
    availableMonths: sorted.map((m) => m.month),
  };
}
