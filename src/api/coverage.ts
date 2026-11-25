import type { Category } from "./transform";
import { isOngoing, normalizeMonth, type CategoryPlan } from "./planning.ts";

export interface CoverageLine {
  id: string;
  category: Category;
  plan: CategoryPlan;
  // Monthly amount this plan assigns to the category.
  amount: number;
}

export interface CategoryCoverage {
  // Months this category ran short and needed money moved in.
  shortMonths: number;
  shortTotal: number;
  worstShort: number;
  // Months money was pulled out of this category to cover another one.
  donorTimes: number;
  donated: number;
}

export interface CoverageScore {
  months: number;
  // Every time a category ran short in a month: one "move money" moment.
  covers: number;
  // Covers the shared cushion handled on its own.
  fromCushionOnly: number;
  // Covers that had to pull money out of other categories.
  fromOtherCategories: number;
  // Covers nothing in the budget could fund (new money needed).
  uncoveredTimes: number;
  uncovered: number;
  monthsWithCovers: number;
  movedFromCushion: number;
  movedFromCategories: number;
  byCategory: Record<string, CategoryCoverage>;
  shortRanking: { id: string; shortMonths: number; shortTotal: number }[];
  donorRanking: { id: string; donorTimes: number; donated: number }[];
}

const empty = (): CategoryCoverage => ({
  shortMonths: 0,
  shortTotal: 0,
  worstShort: 0,
  donorTimes: 0,
  donated: 0,
});

/**
 * What the category actually held before the first loaded month, from YNAB's
 * own month-end balance: balance = carried in + assigned + activity.
 */
export function startingBalance(category: Category, month: string): number {
  const balance = category.monthlyBalance?.[month],
    budgeted = category.monthlyBudgeted?.[month],
    activity = category.monthlyData[month];
  if (balance === undefined || budgeted === undefined || activity === undefined)
    return 0;
  return Math.max(0, balance - budgeted - activity);
}

// Who gets raided first when a category runs short. Sinking funds (annual,
// irregular, savings) are never used: that money is already spoken for.
function donorRank(plan: CategoryPlan): number | null {
  if (plan.type !== "monthly") return null;
  return plan.priority === "flexible" ? 1 : 2;
}

/**
 * Replay the loaded months with a plan's monthly amounts and rollover. Each
 * month every category gets its amount and pays its real spending. When one
 * goes negative, cover it the way you would in YNAB: from the shared cushion
 * first, then from flexible categories with money left (most first), then
 * essential monthly ones. Categories start from what they actually held at
 * the start of the window; the cushion starts empty.
 */
export function scoreCoverage(
  lines: CoverageLine[],
  cushionMonthly: number,
  availableMonths: string[],
): CoverageScore {
  const months = [...availableMonths].map(normalizeMonth).sort();
  const active = lines.filter((l) => isOngoing(l.plan.type));
  const byCategory: Record<string, CategoryCoverage> = Object.fromEntries(
    active.map((l) => [l.id, empty()]),
  );
  const monthKey = (l: CoverageLine, month: string) =>
    Object.keys(l.category.monthlyData).find(
      (k) => normalizeMonth(k) === month,
    );
  const excluded = (l: CoverageLine, month: string) =>
    l.plan.history.some((h) => h.month === month && h.excluded);
  const balance = new Map<string, number>();
  for (const l of active) {
    const first = months.find((m) => monthKey(l, m) !== undefined);
    balance.set(
      l.id,
      first ? startingBalance(l.category, monthKey(l, first)!) : 0,
    );
  }
  let cushion = 0;
  const score: CoverageScore = {
    months: months.length,
    covers: 0,
    fromCushionOnly: 0,
    fromOtherCategories: 0,
    uncoveredTimes: 0,
    uncovered: 0,
    monthsWithCovers: 0,
    movedFromCushion: 0,
    movedFromCategories: 0,
    byCategory,
    shortRanking: [],
    donorRanking: [],
  };
  for (const month of months) {
    cushion += Math.max(0, cushionMonthly);
    for (const l of active) {
      const key = monthKey(l, month),
        spent =
          key === undefined || excluded(l, month)
            ? 0
            : -l.category.monthlyData[key];
      balance.set(l.id, balance.get(l.id)! + l.amount - spent);
    }
    const short = active
      .filter((l) => balance.get(l.id)! < -0.005)
      .sort((a, b) => balance.get(a.id)! - balance.get(b.id)!);
    if (short.length) score.monthsWithCovers++;
    for (const l of short) {
      let need = -balance.get(l.id)!;
      const stat = byCategory[l.id];
      stat.shortMonths++;
      stat.shortTotal += need;
      stat.worstShort = Math.max(stat.worstShort, need);
      score.covers++;
      const fromCushion = Math.min(cushion, need);
      cushion -= fromCushion;
      need -= fromCushion;
      score.movedFromCushion += fromCushion;
      let raided = false;
      if (need > 0.005) {
        const donors = active
          .filter(
            (d) =>
              d.id !== l.id &&
              donorRank(d.plan) !== null &&
              balance.get(d.id)! > 0.005,
          )
          .sort(
            (a, b) =>
              donorRank(a.plan)! - donorRank(b.plan)! ||
              balance.get(b.id)! - balance.get(a.id)!,
          );
        for (const d of donors) {
          if (need <= 0.005) break;
          const take = Math.min(balance.get(d.id)!, need);
          balance.set(d.id, balance.get(d.id)! - take);
          need -= take;
          raided = true;
          byCategory[d.id].donorTimes++;
          byCategory[d.id].donated += take;
          score.movedFromCategories += take;
        }
      }
      if (need > 0.005) {
        score.uncoveredTimes++;
        score.uncovered += need;
      }
      if (raided) score.fromOtherCategories++;
      else if (need <= 0.005) score.fromCushionOnly++;
      balance.set(l.id, 0);
    }
  }
  score.shortRanking = Object.entries(byCategory)
    .filter(([, s]) => s.shortMonths > 0)
    .map(([id, s]) => ({
      id,
      shortMonths: s.shortMonths,
      shortTotal: s.shortTotal,
    }))
    .sort(
      (a, b) => b.shortMonths - a.shortMonths || b.shortTotal - a.shortTotal,
    );
  score.donorRanking = Object.entries(byCategory)
    .filter(([, s]) => s.donorTimes > 0)
    .map(([id, s]) => ({ id, donorTimes: s.donorTimes, donated: s.donated }))
    .sort((a, b) => b.donorTimes - a.donorTimes || b.donated - a.donated);
  return score;
}

export interface ActualMonth {
  month: string;
  assigned: number | null;
  spent: number;
  endBalance: number | null;
  // YNAB showed the category overspent at month end.
  overspent: boolean;
  // Net assigned was negative: money was moved out of it that month.
  movedOut: boolean;
}

/** What really happened in YNAB, month by month, from the kept history. */
export function actualHistory(category: Category): ActualMonth[] {
  return Object.keys(category.monthlyData)
    .sort((a, b) => normalizeMonth(a).localeCompare(normalizeMonth(b)))
    .map((key) => {
      const assigned = category.monthlyBudgeted?.[key] ?? null,
        endBalance = category.monthlyBalance?.[key] ?? null;
      return {
        month: normalizeMonth(key),
        assigned,
        spent: -category.monthlyData[key],
        endBalance,
        overspent: endBalance !== null && endBalance < -0.005,
        movedOut: assigned !== null && assigned < -0.005,
      };
    });
}
