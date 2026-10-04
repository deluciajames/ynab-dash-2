import type { Category, GoalDetails } from "./transform";

export type FundingType =
  | "monthly"
  | "annual"
  | "irregular"
  | "savings"
  | "oneoff";
export interface CategoryOverride {
  target?: number;
  currentMonthly?: number | null;
  fundingType?: FundingType;
  // One-off classification preserves the original funding type and proposed amount for undo.
  oneOff?: boolean;
  fixedBill?: boolean;
  excludedMonths?: string[];
  exclusionReasons?: Record<string, string>;
  billAmount?: number | null;
  saved?: number | null;
  dueDate?: string;
  expectedAnnual?: number | null;
  savingsMonthly?: number | null;
}
export type OverridesMap = Record<string, CategoryOverride>;
export const fundingLabels: Record<FundingType, string> = {
  monthly: "Monthly spending",
  annual: "Annual / due-date bill",
  irregular: "Irregular expense",
  savings: "Savings goal",
  oneoff: "One-off",
};
const finiteAmount = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
export function normalizeMonth(month: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) return month.slice(0, 7) + "-01";
  const [label, year] = month.split(" ");
  const index = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(label);
  return index >= 0 && /^\d{4}$/.test(year || "")
    ? `${year}-${String(index + 1).padStart(2, "0")}-01`
    : month;
}
export function monthLabel(month: string, short = false) {
  const iso = normalizeMonth(month);
  const date = new Date(iso + "T12:00:00");
  return Number.isNaN(date.getTime())
    ? month
    : date.toLocaleDateString("en-US", {
        month: "short",
        ...(short ? {} : { year: "numeric" }),
      });
}
export function expense(activity: number): number {
  return -activity;
}
export function goalPeriodMonths(goal: GoalDetails): number | null {
  const f = goal.frequency && goal.frequency > 0 ? goal.frequency : 1;
  if (goal.type === "MF") return 1;
  if (goal.cadence === 1) return f;
  if (goal.cadence === 2) return (12 / 52) * f;
  if (goal.cadence === 13) return 12 * f;
  if (goal.cadence === 14) return 24;
  if (goal.cadence != null && goal.cadence >= 3 && goal.cadence <= 12)
    return goal.cadence - 1;
  return null;
}
export function fundingType(
  cat: Category,
  ov: CategoryOverride = {},
): FundingType {
  if (ov.oneOff || ov.fundingType === "oneoff") return "oneoff";
  if (ov.fundingType) return ov.fundingType;
  if (cat.hidden && ov.oneOff !== false) return "oneoff";
  const goal = cat.goal;
  if (goal?.dueDate) return "annual";
  if (goal?.type === "MF" || goal?.type === "TB") return "savings";
  if (goal && (goalPeriodMonths(goal) ?? 0) > 1) return "irregular";
  // Activity alone cannot reliably distinguish annual, irregular and one-time expenses.
  return "monthly";
}
export function currentContribution(
  cat: Category,
  ov: CategoryOverride = {},
): number | null {
  if (ov.currentMonthly !== undefined)
    return finiteAmount(ov.currentMonthly) ? ov.currentMonthly : null;
  const goal = cat.goal;
  if (!goal || !finiteAmount(goal.target)) return null;
  const period = goalPeriodMonths(goal);
  if (period !== null) return goal.target / period;
  // TB and TBD are total-balance goals, not monthly contribution amounts.
  return null;
}
export function depositsLeft(
  dueDate: string | null | undefined,
  today: Date,
): number | null {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const [year, month, day] = dueDate.split("-").map(Number);
  const due = new Date(year, month - 1, day);
  if (
    due.getFullYear() !== year ||
    due.getMonth() !== month - 1 ||
    due.getDate() !== day
  )
    return null;
  if (due < new Date(today.getFullYear(), today.getMonth(), today.getDate()))
    return 0;
  // Includes a deposit this month and one before payment in the due month.
  return (year - today.getFullYear()) * 12 + month - 1 - today.getMonth() + 1;
}
function percentile75(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b),
    index = 0.75 * (sorted.length - 1);
  return (
    sorted[Math.floor(index)] +
    (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) *
      (index - Math.floor(index))
  );
}
export function planCategory(
  cat: Category,
  ov: CategoryOverride = {},
  today = new Date(),
) {
  const type = fundingType(cat, ov),
    excluded = new Set((ov.excludedMonths || []).map(normalizeMonth));
  const history = Object.entries(cat.monthlyData)
    .sort(([a], [b]) => normalizeMonth(a).localeCompare(normalizeMonth(b)))
    .map(([month, activity]) => ({
      month: normalizeMonth(month),
      amount: expense(activity),
      excluded: type === "monthly" && excluded.has(normalizeMonth(month)),
    }));
  const rawTotal = history.reduce((s, m) => s + m.amount, 0),
    rawAverage = history.length ? rawTotal / history.length : null;
  const included = history.filter((m) => !m.excluded),
    average = included.length
      ? included.reduce((s, m) => s + m.amount, 0) / included.length
      : null;
  const current = currentContribution(cat, ov);
  const goal = cat.goal;
  const billAmount =
    ov.billAmount !== undefined ? ov.billAmount : (goal?.target ?? null);
  const saved =
    ov.saved !== undefined
      ? ov.saved
      : (goal?.funded ?? Math.max(0, cat.balance));
  const dueDate = ov.dueDate !== undefined ? ov.dueDate : (goal?.dueDate ?? "");
  const deposits = depositsLeft(dueDate, today);
  const period = goal ? goalPeriodMonths(goal) : null;
  const annualFromGoal =
    goal && finiteAmount(goal.target) && period !== null
      ? (goal.target * 12) / period
      : null;
  const expectedAnnual =
    ov.expectedAnnual !== undefined
      ? ov.expectedAnnual
      : (annualFromGoal ??
        (history.length >= 12
          ? Math.max(
              0,
              history.slice(-12).reduce((s, m) => s + m.amount, 0),
            )
          : null));
  const savingsMonthly =
    ov.savingsMonthly !== undefined
      ? ov.savingsMonthly
      : goal?.type === "MF"
        ? current
        : null;
  let need: number | null = null,
    explanation = "",
    method = "",
    warning = "";
  if (type === "oneoff") {
    need = 0;
    method = "No repeat allocation";
    explanation =
      "This event remains in your history. Your shared One-Off reserve is planned separately.";
  } else if (type === "annual") {
    if (finiteAmount(billAmount) && finiteAmount(saved)) {
      const remaining = Math.max(0, billAmount - saved);
      if (remaining === 0) need = 0;
      else if (deposits && deposits > 0) need = remaining / deposits;
      if (deposits === 0 && remaining > 0)
        warning =
          "This bill is already due. The remaining amount needs funding now.";
    }
    method =
      deposits && deposits > 0
        ? `Due ${dueDate.slice(0, 7)} · ${deposits} deposits`
        : need === 0
          ? "Already funded"
          : "Review amount and date";
    explanation =
      "Expected bill minus funding already credited, divided by the remaining monthly deposits. Assumes a deposit this month and before payment in the due month.";
  } else if (type === "irregular") {
    if (finiteAmount(expectedAnnual)) need = expectedAnnual / 12;
    method =
      expectedAnnual === null ? "Choose yearly amount" : "Yearly amount ÷ 12";
    explanation =
      "Quiet months count: the fund builds between expenses. A yearly contribution alone does not guarantee an early bill is covered; review the available balance and timing.";
  } else if (type === "savings") {
    if (finiteAmount(savingsMonthly)) need = savingsMonthly;
    method = "Chosen commitment";
    explanation =
      "Use the amount you intend to save. Low spending from this category is not a reason to reduce your savings.";
  } else {
    if (ov.fixedBill) need = current;
    else if (average !== null)
      need = Math.max(0, average, percentile75(included.map((m) => m.amount)));
    method = ov.fixedBill
      ? "Fixed bill"
      : `${included.length} months${history.length !== included.length ? ` · ${history.length - included.length} excluded` : ""}`;
    explanation = ov.fixedBill
      ? "Keep the known fixed bill amount. History exclusions do not change the cost of the bill."
      : "Use the larger of the planning average and the level three out of four included months fall below. Suggestions round up to $5.";
    if (history.length < 12)
      warning = `Only ${history.length} completed months of category history are available; this may miss seasonal expenses.`;
  }
  if (need === null && !warning)
    warning = "Review the planning inputs before accepting a recommendation.";
  const recommendation =
    need === null || type === "oneoff" ? null : Math.ceil(need / 5) * 5;
  const proposed =
    type === "oneoff" ? 0 : finiteAmount(ov.target) ? ov.target : current;
  const discrepancy = current !== null && need !== null ? current - need : null;
  return {
    type,
    history,
    rawTotal,
    rawAverage,
    average,
    includedCount: included.length,
    current,
    need,
    recommendation,
    proposed,
    discrepancy,
    billAmount,
    saved,
    dueDate,
    deposits,
    expectedAnnual,
    savingsMonthly,
    explanation,
    method,
    warning,
    availableBalance: cat.balance,
  };
}
export type CategoryPlan = ReturnType<typeof planCategory>;
export function totalPlan(plans: CategoryPlan[], annualReserve: number) {
  const active = plans.filter((p) => p.type !== "oneoff");
  return {
    total:
      active.reduce((s, p) => s + (p.proposed ?? 0), 0) + annualReserve / 12,
    missingTargets: active.filter((p) => p.proposed === null).length,
  };
}
export function chartScale(peak: number) {
  if (peak <= 0) return { max: 1, step: 0.25 };
  const rough = (peak * 1.18) / 4,
    magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 3, 4, 5, 6, 8, 10].find((n) => n * magnitude >= rough)! *
    magnitude;
  return { max: Math.ceil((peak * 1.18) / step) * step, step };
}
