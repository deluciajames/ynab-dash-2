import type { CategoryPlan, Priority } from "./planning.ts";
import { scoreCoverage, type CoverageLine } from "./coverage.ts";

const roundUp5 = (n: number) => Math.ceil(n / 5 - 1e-9) * 5 || 0;
const roundDown5 = (n: number) => Math.floor(n / 5 + 1e-9) * 5 || 0;
const cents = (n: number) => Math.round(n * 100) / 100;

// Monthly spending lines whose amount follows history (not fixed bills or
// sinking funds). These are the lines the shared cushion protects.
export const isVariableLine = (p: CategoryPlan) =>
  p.type === "monthly" && !p.fixedBill && p.need !== null;

// A line's realistic monthly amount before any trimming: the typical month
// (rounded up to $5), the bill or goal amount, or the exact fixed bill.
export const baseAmount = (plan: CategoryPlan) =>
  plan.type === "oneoff"
    ? 0
    : plan.fixedBill
      ? plan.current
      : (plan.recommendation ?? plan.proposed ?? 0);

export interface Cushion {
  // Suggested monthly amount for one shared cushion category.
  amount: number;
  months: number;
  // What padding every line to its own 3-in-4 month would cost instead.
  perLinePadding: number;
  // True when even the per-line padding amount would not stop raids; the
  // cushion is then held at that amount.
  capped: boolean;
}

/**
 * Size one shared cushion by replaying the loaded months: the smallest
 * amount (in $5 steps) at which every shortfall, with each line at its
 * realistic amount, could be covered from the cushion without pulling money
 * out of another category. It never goes above what padding each variable
 * line for its own bad months would cost.
 */
export function sharedCushion(
  lines: CoverageLine[],
  months: string[],
): Cushion {
  const variable = lines.filter((l) => isVariableLine(l.plan));
  const perLinePadding = variable.reduce(
    (s, l) =>
      s + Math.max(0, (l.plan.standaloneNeed ?? 0) - (l.plan.need ?? 0)),
    0,
  );
  const result = (amount: number, capped = false): Cushion => ({
    amount,
    months: months.length,
    perLinePadding,
    capped,
  });
  if (months.length < 3 || !variable.length) return result(0);
  // Replay every ongoing line, so the cushion also absorbs a short bill or
  // sinking fund the same way the coverage score does.
  const raids = (cushion: number) => {
    const s = scoreCoverage(lines, cushion, months);
    return s.fromOtherCategories + s.uncoveredTimes;
  };
  if (raids(0) === 0) return result(0);
  const cap = roundUp5(perLinePadding);
  if (cap === 0 || raids(cap) > 0) return result(cap, true);
  let lo = 0,
    hi = cap / 5;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (raids(mid * 5) === 0) hi = mid;
    else lo = mid;
  }
  return result(hi * 5);
}

export interface RolloverLine {
  id: string;
  surplus: number;
}

/**
 * Money already sitting in variable lines beyond one typical month. It can
 * cover a gap this month without zeroing any category; it is not a reason to
 * lower the ongoing amount, because it runs out once spent.
 */
export function usableRollover(entries: { id: string; plan: CategoryPlan }[]): {
  total: number;
  lines: RolloverLine[];
} {
  const lines = entries
    .filter(({ plan }) => isVariableLine(plan))
    .map(({ id, plan }) => ({
      id,
      surplus: roundDown5(
        Math.max(0, plan.availableBalance - (plan.need ?? 0)),
      ),
    }))
    .filter((l) => l.surplus > 0)
    .sort((a, b) => b.surplus - a.surplus);
  return { total: lines.reduce((s, l) => s + l.surplus, 0), lines };
}

export interface FitLine {
  id: string;
  priority: Priority;
  // Realistic amount before any trimming (typical month, bill or goal).
  base: number;
  floor: number;
  // Amount in the fit plan after trimming to income.
  amount: number;
  cut: number;
}

export interface FitPlan {
  lines: FitLine[];
  byId: Record<string, FitLine>;
  cushionBase: number;
  cushion: number;
  reserveMonthly: number;
  // Realistic total before trimming, and the fit plan total after it.
  baseTotal: number;
  total: number;
  income: number | null;
  // How far the realistic plan was over income (0 if it fits).
  gap: number;
  flexibleCut: number;
  cushionCut: number;
  // What is still over income after every flexible line is at its floor
  // and the cushion is gone. Only essentials or income can close it.
  stillOver: number;
}

/**
 * Build a plan you can afford: every line at its realistic amount plus one
 * shared cushion, then, if that is over income, trim flexible lines toward
 * their floors in proportion to how much room each has. Essentials are never
 * trimmed. If flexible room runs out, the cushion shrinks next.
 */
export function fitToIncome(
  entries: { id: string; plan: CategoryPlan }[],
  options: { income: number | null; annualReserve: number; cushion: number },
): FitPlan {
  const lines: FitLine[] = entries
    .filter(({ plan }) => plan.type !== "oneoff")
    .map(({ id, plan }) => {
      const base = baseAmount(plan);
      const floor =
        plan.priority === "flexible" ? Math.min(base, plan.floor) : base;
      return {
        id,
        priority: plan.priority,
        base,
        floor,
        amount: base,
        cut: 0,
      };
    });
  const reserveMonthly = options.annualReserve / 12,
    cushionBase = Math.max(0, options.cushion);
  const baseTotal =
    lines.reduce((s, l) => s + l.base, 0) + cushionBase + reserveMonthly;
  const income = options.income;
  const gap = income === null ? 0 : Math.max(0, cents(baseTotal - income));
  let flexibleCut = 0,
    cushionCut = 0,
    stillOver = 0;
  if (gap > 0) {
    const room = (l: FitLine) => Math.max(0, l.base - l.floor - l.cut);
    const flexible = lines.filter(
      (l) => l.priority === "flexible" && l.base > l.floor,
    );
    const totalRoom = flexible.reduce((s, l) => s + room(l), 0);
    if (totalRoom <= gap) {
      for (const l of flexible) l.cut = l.base - l.floor;
    } else {
      for (const l of flexible)
        l.cut = Math.min(
          l.base - l.floor,
          roundDown5(((l.base - l.floor) * gap) / totalRoom),
        );
      // Close what rounding left in $5 steps, from the most room down.
      let left = gap - flexible.reduce((s, l) => s + l.cut, 0);
      while (left > 0.005) {
        const next = flexible
          .filter((l) => room(l) > 0)
          .sort((a, b) => room(b) - room(a))[0];
        if (!next) break;
        const step = Math.min(5, room(next));
        next.cut += step;
        left -= step;
      }
    }
    flexibleCut = flexible.reduce((s, l) => s + l.cut, 0);
    const rest = Math.max(0, cents(gap - flexibleCut));
    cushionCut = Math.min(cushionBase, rest);
    stillOver = Math.max(0, cents(rest - cushionCut));
  }
  for (const l of lines) l.amount = cents(l.base - l.cut);
  const cushion = cents(cushionBase - cushionCut);
  return {
    lines,
    byId: Object.fromEntries(lines.map((l) => [l.id, l])),
    cushionBase,
    cushion,
    reserveMonthly,
    baseTotal,
    total: cents(baseTotal - flexibleCut - cushionCut),
    income,
    gap,
    flexibleCut,
    cushionCut,
    stillOver,
  };
}

export type ChangeReason =
  // Your plan is below what you usually spend.
  | "usual"
  // Your plan is above what you usually spend; trimming loses nothing.
  | "padding"
  // Trimmed below what you usually spend to fit income: a spending change.
  | "lifestyle";

export interface PlanChange {
  id: string;
  from: number;
  to: number;
  delta: number;
  reason: ChangeReason;
}

/** Where the fit plan adds to and cuts from your current plan, largest first. */
export function planChanges(
  fit: FitPlan,
  plans: Record<string, CategoryPlan>,
): { adds: PlanChange[]; cuts: PlanChange[] } {
  const adds: PlanChange[] = [],
    cuts: PlanChange[] = [];
  for (const l of fit.lines) {
    const from = plans[l.id]?.proposed ?? 0,
      delta = cents(l.amount - from);
    if (Math.abs(delta) < 0.5) continue;
    const change = { id: l.id, from, to: l.amount, delta };
    if (delta > 0) adds.push({ ...change, reason: "usual" });
    else
      cuts.push({
        ...change,
        reason: l.amount < l.base ? "lifestyle" : "padding",
      });
  }
  adds.sort((a, b) => b.delta - a.delta);
  cuts.sort((a, b) => a.delta - b.delta);
  return { adds, cuts };
}
