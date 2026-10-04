import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chartScale,
  currentContribution,
  depositsLeft,
  normalizeMonth,
  planCategory,
  totalPlan,
  fundingType,
  goalPeriodMonths,
} from "../src/api/planning.ts";
import { transformYnabData } from "../src/api/transform.ts";
import type { Category, GoalDetails } from "../src/api/transform.ts";
import type { YnabCategory, YnabMonthDetail } from "../src/api/ynab.ts";
const today = new Date(2026, 9, 2);
const dates = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2025, 9 + i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
});
function goal(change: Partial<GoalDetails> = {}): GoalDetails {
  return {
    type: "NEED",
    target: 150,
    cadence: 1,
    frequency: 1,
    day: null,
    dueDate: null,
    monthsToBudget: null,
    funded: null,
    remaining: null,
    needsWholeAmount: true,
    ...change,
  };
}
function category(
  values = Array(12).fill(100),
  change: Partial<Category> = {},
): Category {
  return {
    id: "c",
    name: "Groceries",
    groupId: "g",
    type: "Expense",
    monthlyData: Object.fromEntries(values.map((v, i) => [dates[i], -v])),
    average: 0,
    total: 0,
    ynabTarget: 150,
    goalType: "NEED",
    goal: goal(),
    balance: 0,
    hidden: false,
    ...change,
  };
}
function apiCategory(change: Partial<YnabCategory> = {}): YnabCategory {
  return {
    id: "c",
    name: "Groceries",
    category_group_id: "g",
    category_group_name: "Food",
    hidden: false,
    deleted: false,
    budgeted: 150000,
    activity: -100000,
    balance: 300000,
    goal_type: "NEED",
    goal_target: 150000,
    goal_cadence: 1,
    goal_months_to_budget: null,
    ...change,
  };
}

test("default uses every complete observed month, including zero months", () => {
  const p = planCategory(
    category([300, 0, 0, 500, 0, 0, 0, 400, 0, 0, 0, 0]),
    {},
    today,
  );
  assert.equal(p.rawTotal, 1200);
  assert.equal(p.rawAverage, 100);
  assert.equal(p.includedCount, 12);
});
test("explicit outlier exclusion changes planning only; raw history remains", () => {
  const c = category([100, 100, 900, ...Array(9).fill(100)]),
    p = planCategory(c, { excludedMonths: ["Dec 2025"] }, today);
  assert.equal(p.rawTotal, 2000);
  assert.equal(p.rawAverage, 2000 / 12);
  assert.equal(p.average, 100);
  assert.equal(p.need, 100);
  assert.equal(p.recommendation, 100);
  assert.equal(p.history.length, 12);
  assert.equal(p.includedCount, 11);
  assert.equal(p.history[2].amount, 900);
  assert.equal(p.history[2].excluded, true);
  assert.equal(p.proposed, 150);
});
test("recommendation never falls below planning mean even with a large high-tail expense", () => {
  const p = planCategory(
    category([100, 100, 900, ...Array(9).fill(100)]),
    {},
    today,
  );
  assert.equal(p.need, 2000 / 12);
  assert.equal(p.recommendation, 170);
});
test("zero spending and a valid zero YNAB target are preserved", () => {
  const c = category(Array(12).fill(0), { goal: goal({ target: 0 }) });
  const p = planCategory(c, {}, today);
  assert.equal(p.current, 0);
  assert.equal(p.proposed, 0);
  assert.equal(p.need, 0);
  assert.equal(p.recommendation, 0);
});
test("no target is unknown and does not silently become a recommendation", () => {
  const p = planCategory(category(undefined, { goal: null }), {}, today);
  assert.equal(p.current, null);
  assert.equal(p.proposed, null);
  assert.equal(totalPlan([p], 0).missingTargets, 1);
});
test("observed missing history is not padded with fictitious zero months", () => {
  const p = planCategory(category([100, 200, 300]), {}, today);
  assert.equal(p.history.length, 3);
  assert.equal(p.rawAverage, 200);
  assert.match(p.warning, /Only 3/);
});
test("no included observations means no recommendation", () => {
  const p = planCategory(
    category([100]),
    { excludedMonths: [dates[0]] },
    today,
  );
  assert.equal(p.need, null);
  assert.equal(p.recommendation, null);
});
test("net positive activity is not treated as spending", () => {
  assert.equal(planCategory(category([-100]), {}, today).history[0].amount, -100);
});
test("annual current contribution is normalized; deadline need uses saved funding", () => {
  const c = category(Array(12).fill(0), {
    goal: goal({
      target: 1200,
      cadence: 13,
      dueDate: "2027-03-31",
      funded: 300,
    }),
  });
  const p = planCategory(c, {}, today);
  assert.equal(p.type, "annual");
  assert.equal(p.current, 100);
  assert.equal(p.deposits, 6);
  assert.equal(p.need, 150);
  assert.equal(p.discrepancy, -50);
});
test("annual bill already funded needs no further money; excess does not create negative need", () => {
  const c = category(undefined, {
    goal: goal({
      target: 1200,
      cadence: 13,
      dueDate: "2027-03-31",
      funded: 1400,
    }),
  });
  assert.equal(planCategory(c, {}, today).need, 0);
});
test("due bill is flagged without dividing by zero", () => {
  const p = planCategory(
    category(),
    {
      fundingType: "annual",
      billAmount: 1200,
      saved: 300,
      dueDate: "2026-09-30",
    },
    today,
  );
  assert.equal(p.need, null);
  assert.match(p.warning, /already due/);
  assert.equal(p.recommendation, null);
});
test("invalid calendar dates are not silently rolled into another month", () => {
  assert.equal(depositsLeft("2027-02-31", today), null);
  assert.equal(depositsLeft("", today), null);
  assert.equal(depositsLeft("2026-10-02", today), 1);
  assert.equal(depositsLeft("2026-10-01", today), 0);
});
test("manual missing annual inputs remain unknown rather than falling back to imported values", () => {
  const p = planCategory(
    category(),
    {
      fundingType: "annual",
      billAmount: null,
      saved: 300,
      dueDate: "2027-03-31",
    },
    today,
  );
  assert.equal(p.need, null);
});
test("irregular yearly reserve counts quiet months and ignores monthly exclusions", () => {
  const c = category([300, 0, 0, 500, 0, 0, 0, 400, 0, 0, 0, 0], {
    goal: null,
  });
  const p = planCategory(
    c,
    { fundingType: "irregular", excludedMonths: [dates[3]] },
    today,
  );
  assert.equal(p.expectedAnnual, 1200);
  assert.equal(p.need, 100);
  assert.equal(p.includedCount, 12);
});
test("short irregular history needs an annual expectation instead of automatic annualization", () => {
  const c = category([0, 900, 0], { goal: null });
  assert.equal(planCategory(c, { fundingType: "irregular" }, today).need, null);
  assert.equal(
    planCategory(c, { fundingType: "irregular", expectedAnnual: 1200 }, today)
      .need,
    100,
  );
});
test("savings commitment is independent of zero spending", () => {
  const c = category(Array(12).fill(0), {
      goal: goal({ type: "MF", target: 300 }),
    }),
    p = planCategory(c, {}, today);
  assert.equal(p.type, "savings");
  assert.equal(p.need, 300);
  assert.equal(p.recommendation, 300);
});
test("undated total-balance goal is not confused with a monthly contribution", () => {
  const c = category(undefined, {
    goal: goal({ type: "TB", target: 10000, cadence: 0 }),
  });
  const p = planCategory(c, {}, today);
  assert.equal(p.type, "savings");
  assert.equal(p.current, null);
  assert.equal(p.need, null);
  assert.equal(planCategory(c, { savingsMonthly: 250 }, today).need, 250);
});
test("one-off classification excludes targets without losing history or existing proposed value", () => {
  const c = category(),
    p = planCategory(c, { oneOff: true, target: 200 }, today);
  assert.equal(p.rawTotal, 1200);
  assert.equal(p.need, 0);
  assert.equal(p.proposed, 0);
  assert.equal(
    planCategory(c, { oneOff: false, target: 200 }, today).proposed,
    200,
  );
});
test("hidden categories start in One-Off and can explicitly return to ongoing plan", () => {
  const c = category(undefined, { hidden: true });
  assert.equal(fundingType(c), "oneoff");
  assert.equal(fundingType(c, { oneOff: false }), "monthly");
});
test("full plan counts shared reserve once and does not count excluded one-off targets", () => {
  const a = planCategory(category(), { target: 100 }, today),
    b = planCategory(category(), { oneOff: true, target: 900 }, today);
  assert.deepEqual(totalPlan([a, b], 6000), { total: 600, missingTargets: 0 });
});
test("weekly and multi-month YNAB cadences normalize correctly", () => {
  assert.equal(
    currentContribution(
      category(undefined, { goal: goal({ target: 120, cadence: 4 }) }),
    ),
    40,
  );
  assert.equal(
    currentContribution(
      category(undefined, {
        goal: goal({ target: 1200, cadence: 13, frequency: 2 }),
      }),
    ),
    50,
  );
  assert.equal(
    currentContribution(
      category(undefined, { goal: goal({ target: 1200, cadence: 14 }) }),
    ),
    50,
  );
  assert.equal(
    currentContribution(
      category(undefined, {
        goal: goal({ target: 120, cadence: 1, frequency: 3 }),
      }),
    ),
    40,
  );
  assert.equal(goalPeriodMonths(goal({ cadence: 2 })), 12 / 52);
  assert.equal(
    currentContribution(
      category(undefined, { goal: goal({ target: 90, cadence: 2 }) }),
    ),
    390,
  );
});
test("small chart scale and all-zero chart have appropriate finite ranges", () => {
  assert.equal(chartScale(14).max, 20);
  assert.equal(chartScale(0).max, 1);
  assert.ok(chartScale(8000).max >= 8000);
});
test("legacy display-month exclusions normalize to stable ISO month keys", () => {
  assert.equal(normalizeMonth("Dec 2025"), "2025-12-01");
});
test("transform retains current metadata, zero goals, and categories without historical rows", () => {
  const old = apiCategory({
    name: "Old name",
    category_group_name: "Old group",
    goal_target: 900000,
  });
  const months: YnabMonthDetail[] = [
    {
      month: dates[0],
      income: 5000000,
      budgeted: 0,
      activity: 0,
      categories: [old],
    },
  ];
  const current = apiCategory({ goal_target: 0 }),
    newCat = apiCategory({
      id: "new",
      name: "New expense",
      goal_type: null,
      goal_target: null,
    });
  const result = transformYnabData(months, { c: current, new: newCat });
  assert.equal(result.categories[0].name, "Groceries");
  assert.equal(result.groups[0].name, "Food");
  assert.equal(result.categories[0].goal?.target, 0);
  assert.equal(result.categories[0].balance, 300);
  assert.equal(result.categories[1].goal, null);
  assert.equal(Object.keys(result.categories[1].monthlyData).length, 0);
  assert.equal(result.availableMonths[0], dates[0]);
});
test("no current goal clears stale historical goals; income is not inferred from arbitrary group name", () => {
  const cat = apiCategory({ category_group_name: "Income protection" });
  const result = transformYnabData(
    [
      {
        month: dates[0],
        income: 0,
        budgeted: 0,
        activity: 0,
        categories: [cat],
      },
    ],
    { c: { ...cat, goal_type: null, goal_target: null } },
  );
  assert.equal(result.categories[0].goal, null);
  assert.equal(result.categories[0].type, "Expense");
});

test("refunds offset historical spending without generating a negative funding recommendation", () => {
  const p = planCategory(category([100, -100]), {}, today);
  assert.equal(p.rawTotal, 0);
  assert.equal(p.rawAverage, 0);
  assert.ok(p.need! >= 0);
  assert.equal(planCategory(category([-100, -200]), {}, today).need, 0);
});
