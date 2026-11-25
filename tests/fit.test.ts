import assert from "node:assert/strict";
import { test } from "node:test";
import { planCategory, totalPlan } from "../src/api/planning.ts";
import type { CategoryOverride } from "../src/api/planning.ts";
import {
  baseAmount,
  fitToIncome,
  planChanges,
  sharedCushion,
  usableRollover,
} from "../src/api/fit.ts";
import {
  actualHistory,
  scoreCoverage,
  startingBalance,
} from "../src/api/coverage.ts";
import { transformYnabData } from "../src/api/transform.ts";
import type { Category } from "../src/api/transform.ts";
import type { YnabCategory } from "../src/api/ynab.ts";

const today = new Date(2026, 9, 2);
const dates = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2025, 9 + i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
});
function category(
  id: string,
  values: number[],
  change: Partial<Category> = {},
): Category {
  return {
    id,
    name: id,
    groupId: "g",
    type: "Expense",
    monthlyData: Object.fromEntries(values.map((v, i) => [dates[i], -v])),
    average: 0,
    total: 0,
    ynabTarget: null,
    goalType: null,
    goal: null,
    balance: 0,
    hidden: false,
    ...change,
  };
}
const entry = (c: Category, ov: CategoryOverride = {}) => ({
  id: c.id,
  plan: planCategory(c, ov, today),
});

test("monthly need is the typical month; the bad-month level is kept separately", () => {
  const p = planCategory(
    category(
      "drinks",
      [100, 300, 100, 100, 300, 100, 100, 300, 100, 100, 300, 100],
    ),
    {},
    today,
  );
  assert.equal(p.need, 2000 / 12);
  assert.equal(p.recommendation, 170);
  assert.equal(p.standaloneNeed, 300);
});

test("monthly spending defaults to flexible with a floor at half the typical month", () => {
  const p = planCategory(category("food", Array(12).fill(147)), {}, today);
  assert.equal(p.priority, "flexible");
  assert.equal(p.floor, 70);
  assert.equal(p.floorSet, false);
  const set = planCategory(
    category("food", Array(12).fill(147)),
    { priority: "essential", floor: 120 },
    today,
  );
  assert.equal(set.priority, "essential");
  assert.equal(set.floor, 120);
  assert.equal(set.floorSet, true);
});

test("fixed bills and sinking funds default to essential", () => {
  const rent = planCategory(
    category("rent", Array(12).fill(800)),
    { fixedBill: true, currentMonthly: 800 },
    today,
  );
  assert.equal(rent.priority, "essential");
  assert.equal(rent.fixedBill, true);
  const gifts = planCategory(
    category("gifts", Array(12).fill(50)),
    { fundingType: "irregular", expectedAnnual: 600 },
    today,
  );
  assert.equal(gifts.priority, "essential");
});

test("the shared cushion is the smallest amount that covers every shortfall without raiding", () => {
  const a = category(
      "a",
      [100, 300, 100, 100, 300, 100, 100, 300, 100, 100, 300, 100],
    ),
    b = category(
      "b",
      [300, 100, 100, 300, 100, 100, 300, 100, 100, 300, 100, 100],
    );
  const lines = [a, b].map((c) => {
    const plan = planCategory(c, {}, today);
    return { id: c.id, category: c, plan, amount: baseAmount(plan) };
  });
  const cushion = sharedCushion(lines, dates);
  assert.equal(cushion.months, 12);
  assert.equal(cushion.capped, false);
  assert.equal(cushion.amount % 5, 0);
  assert.ok(cushion.amount > 0);
  assert.ok(cushion.amount < cushion.perLinePadding);
  const withCushion = scoreCoverage(lines, cushion.amount, dates);
  assert.equal(withCushion.fromOtherCategories + withCushion.uncoveredTimes, 0);
  const smaller = scoreCoverage(lines, cushion.amount - 5, dates);
  assert.ok(smaller.fromOtherCategories + smaller.uncoveredTimes > 0);
});

test("steady lines, fixed bills and excluded outliers need no cushion", () => {
  const rent = category("rent", [800, 800, 2400, ...Array(9).fill(800)]);
  const steady = category("steady", [100, 100, 900, ...Array(9).fill(100)]);
  const lines = [
    { c: rent, ov: { fixedBill: true, currentMonthly: 800 } },
    { c: steady, ov: { excludedMonths: [dates[2]] } },
  ].map(({ c, ov }) => {
    const plan = planCategory(c, ov, today);
    return { id: c.id, category: c, plan, amount: baseAmount(plan) };
  });
  assert.equal(sharedCushion(lines, dates).amount, 0);
});

test("a plan that fits income is not trimmed", () => {
  const fit = fitToIncome([entry(category("a", Array(12).fill(100)))], {
    income: 1000,
    annualReserve: 1200,
    cushion: 50,
  });
  assert.equal(fit.baseTotal, 250);
  assert.equal(fit.total, 250);
  assert.equal(fit.gap, 0);
  assert.equal(fit.byId.a.amount, 100);
});

test("over income trims flexible lines toward their floors and leaves essentials alone", () => {
  const entries = [
    entry(category("rent", Array(12).fill(800)), {
      fixedBill: true,
      currentMonthly: 800,
    }),
    entry(category("drinks", Array(12).fill(200))),
    entry(category("clothes", Array(12).fill(100))),
    entry(category("groceries", Array(12).fill(400)), {
      priority: "essential",
    }),
  ];
  // Realistic: 800 + 200 + 100 + 400 + 40 cushion = 1540; income 1450.
  const fit = fitToIncome(entries, {
    income: 1450,
    annualReserve: 0,
    cushion: 40,
  });
  assert.equal(fit.gap, 90);
  assert.equal(fit.byId.rent.amount, 800);
  assert.equal(fit.byId.groceries.amount, 400);
  // Drinks has room 100 (floor 100), clothes room 50 (floor 50): cut 2:1.
  assert.equal(fit.byId.drinks.cut, 60);
  assert.equal(fit.byId.clothes.cut, 30);
  assert.equal(fit.flexibleCut, 90);
  assert.equal(fit.cushion, 40);
  assert.equal(fit.total, 1450);
  assert.equal(fit.stillOver, 0);
  for (const l of fit.lines) assert.equal(l.cut % 5, 0);
});

test("when flexible room runs out the cushion shrinks, then the rest is reported", () => {
  const entries = [
    entry(category("rent", Array(12).fill(800)), {
      fixedBill: true,
      currentMonthly: 800,
    }),
    entry(category("drinks", Array(12).fill(200)), { floor: 150 }),
  ];
  const fit = fitToIncome(entries, {
    income: 900,
    annualReserve: 0,
    cushion: 40,
  });
  assert.equal(fit.gap, 140);
  assert.equal(fit.byId.drinks.amount, 150);
  assert.equal(fit.cushionCut, 40);
  assert.equal(fit.cushion, 0);
  assert.equal(fit.stillOver, 50);
});

test("plan changes split into adds and cuts, and label why", () => {
  const entries = [
    entry(category("fastfood", Array(12).fill(200)), { target: 120 }),
    entry(category("coffee", Array(12).fill(40)), { target: 60 }),
    entry(category("drinks", Array(12).fill(200)), { target: 200 }),
  ];
  const plans = Object.fromEntries(entries.map((e) => [e.id, e.plan]));
  const fit = fitToIncome(entries, {
    income: 420,
    annualReserve: 0,
    cushion: 0,
  });
  const { adds, cuts } = planChanges(fit, plans);
  assert.deepEqual(
    adds.map((c) => [c.id, c.reason]),
    [["fastfood", "usual"]],
  );
  const reasons = Object.fromEntries(cuts.map((c) => [c.id, c.reason]));
  // Coffee only loses padding above its usual $40; drinks is trimmed below
  // its usual $200 to fit income.
  assert.equal(reasons.coffee, "padding");
  assert.equal(reasons.drinks, "lifestyle");
  assert.equal(fit.total, 420);
});

test("usable rollover keeps one typical month in each line", () => {
  const { total, lines } = usableRollover([
    entry(category("food", Array(12).fill(150), { balance: 174.89 })),
    entry(category("drinks", Array(12).fill(200), { balance: 420 })),
    entry(category("rent", Array(12).fill(800), { balance: 1600 }), {
      fixedBill: true,
      currentMonthly: 800,
    }),
  ]);
  assert.deepEqual(lines, [
    { id: "drinks", surplus: 220 },
    { id: "food", surplus: 20 },
  ]);
  assert.equal(total, 240);
});

test("total plan includes the shared cushion", () => {
  const p = planCategory(
    category("a", Array(12).fill(100)),
    { target: 100 },
    today,
  );
  assert.deepEqual(totalPlan([p], 1200, 50), { total: 250, missingTargets: 0 });
});

function apiCategory(change: Partial<YnabCategory>): YnabCategory {
  return {
    id: "c",
    name: "Food",
    category_group_id: "g",
    category_group_name: "Spending",
    hidden: false,
    deleted: false,
    budgeted: 0,
    activity: 0,
    balance: 0,
    goal_type: null,
    goal_target: null,
    goal_cadence: null,
    goal_months_to_budget: null,
    ...change,
  };
}

test("transform keeps each month's assigned amount and month-end balance", () => {
  const data = transformYnabData([
    {
      month: "2026-01-01",
      income: 0,
      budgeted: 0,
      activity: 0,
      categories: [
        apiCategory({ budgeted: 150000, activity: -180000, balance: -30000 }),
      ],
    },
    {
      month: "2026-02-01",
      income: 0,
      budgeted: 0,
      activity: 0,
      categories: [
        apiCategory({ budgeted: -20000, activity: -50000, balance: 80000 }),
      ],
    },
  ]);
  const c = data.categories[0];
  assert.deepEqual(c.monthlyBudgeted, { "2026-01-01": 150, "2026-02-01": -20 });
  assert.deepEqual(c.monthlyBalance, { "2026-01-01": -30, "2026-02-01": 80 });
  const actual = actualHistory(c);
  assert.equal(actual[0].overspent, true);
  assert.equal(actual[1].movedOut, true);
  assert.equal(actual[0].spent, 180);
});

const line = (c: Category, amount: number, ov: CategoryOverride = {}) => ({
  id: c.id,
  category: c,
  plan: planCategory(c, ov, today),
  amount,
});

test("a steady plan at the typical month never needs covering", () => {
  const score = scoreCoverage(
    [line(category("a", Array(12).fill(100)), 100)],
    0,
    dates,
  );
  assert.equal(score.covers, 0);
  assert.equal(score.months, 12);
});

test("shortfalls are covered from the cushion first", () => {
  const spiky = category("a", [100, 100, 100, 160, ...Array(8).fill(100)]);
  const score = scoreCoverage([line(spiky, 100)], 20, dates);
  assert.equal(score.covers, 1);
  assert.equal(score.fromCushionOnly, 1);
  assert.equal(score.fromOtherCategories, 0);
  assert.equal(score.movedFromCushion, 60);
  assert.equal(score.byCategory.a.shortMonths, 1);
  assert.equal(score.byCategory.a.worstShort, 60);
});

test("without a cushion, flexible lines are raided before essentials and sinking funds never are", () => {
  const spiky = category("fastfood", [100, 250, ...Array(10).fill(100)]);
  const drinks = category("drinks", Array(12).fill(0));
  const groceries = category("groceries", Array(12).fill(0));
  const trip = category("trip", Array(12).fill(0));
  const score = scoreCoverage(
    [
      line(spiky, 100),
      line(drinks, 50),
      line(groceries, 500, { priority: "essential" }),
      line(trip, 1000, { fundingType: "savings", savingsMonthly: 1000 }),
    ],
    0,
    dates,
  );
  assert.equal(score.covers, 1);
  assert.equal(score.fromOtherCategories, 1);
  // Drinks held 100 after two months; the other 50 comes from groceries.
  assert.equal(score.byCategory.drinks.donated, 100);
  assert.equal(score.byCategory.groceries.donated, 50);
  assert.equal(score.byCategory.trip.donorTimes, 0);
  assert.deepEqual(
    score.donorRanking.map((d) => d.id),
    ["drinks", "groceries"],
  );
  assert.deepEqual(
    score.shortRanking.map((s) => s.id),
    ["fastfood"],
  );
});

test("shortfalls nothing can fund count as needing new money", () => {
  const score = scoreCoverage(
    [line(category("a", [500, ...Array(11).fill(0)]), 100)],
    0,
    dates,
  );
  assert.equal(score.uncoveredTimes, 1);
  assert.equal(score.uncovered, 400);
});

test("categories start from what they held at the start of the window", () => {
  const c = category("a", [300, ...Array(11).fill(100)], {
    monthlyBudgeted: { [dates[0]]: 100 },
    monthlyBalance: { [dates[0]]: 50 },
  });
  // 50 = carried + 100 assigned - 300 spent, so 250 was carried in.
  assert.equal(startingBalance(c, dates[0]), 250);
  assert.equal(scoreCoverage([line(c, 100)], 0, dates).covers, 0);
});

test("excluded outlier months are not replayed", () => {
  const c = category("a", [100, 100, 900, ...Array(9).fill(100)]);
  const score = scoreCoverage(
    [line(c, 100, { excludedMonths: [dates[2]] })],
    0,
    dates,
  );
  assert.equal(score.covers, 0);
});

test("one-off categories are left out of the replay", () => {
  const c = category("a", [900, ...Array(11).fill(0)]);
  const score = scoreCoverage([line(c, 0, { oneOff: true })], 0, dates);
  assert.equal(score.covers, 0);
  assert.deepEqual(score.byCategory, {});
});

test("ended categories are left out of the fit plan and the replay", () => {
  // A subscription that ran every month until it was cancelled.
  const sub = category("streaming", Array(12).fill(20)),
    food = category("food", Array(12).fill(100));
  const fit = fitToIncome([entry(sub, { ended: true }), entry(food)], {
    income: 1000,
    annualReserve: 0,
    cushion: 0,
  });
  assert.equal(fit.byId.streaming, undefined);
  assert.equal(fit.total, 100);
  assert.equal(baseAmount(planCategory(sub, { ended: true }, today)), 0);
  const score = scoreCoverage([line(sub, 0, { ended: true })], 0, dates);
  assert.equal(score.covers, 0);
  assert.deepEqual(score.byCategory, {});
});
