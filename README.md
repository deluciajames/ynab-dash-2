# Budget clarity

A personal YNAB dashboard for comparing your spending with your targets, planning for future expenses, and checking that your plan fits your take-home income.

## Using the app

Connect to YNAB with your personal access token, then select a budget. Groups start collapsed; open a group, search for a category, or filter to categories that need attention. Click a category name to review its monthly spending and planning inputs.

- The table's columns, all per month: **Estimated need** (from the category's purpose and history), **YNAB target** (your current target as a monthly amount), **Target vs. need** (YNAB target minus estimated need), **Your plan** (the sandbox amount you edit; it starts at the YNAB target and never changes YNAB) and **Suggestion** (the line's amount in the fit plan: estimated need rounded up to $5, trimmed only when the plan has to fit your income). Hover a column heading for its definition.
- **Monthly spending** uses the included-month average, your typical month. Months that run higher are covered by one shared cushion for the whole budget (see Fit to your income) instead of padding every line. A known fixed bill uses its current contribution. Suggested amounts round up to $5.
- **Annual / due-date bills** use the expected amount, funding already credited, and remaining deposits. This assumes a deposit this month and before payment in the due month; revise the date or credited amount when that assumption does not fit.
- **Irregular expenses** use an expected yearly amount divided by 12. A full year of history can provide a starting estimate. Review starting reserves and bill timing; this alone does not guarantee that an early expense is covered.
- **Savings goals** use a chosen contribution, rather than their spending activity.
- **One-Off** categories keep their history but have no recurring allocation. A separate yearly reserve is included once in the monthly plan.
- **Ended** categories are cancelled or finished for good, such as a cancelled subscription or a paid-off loan. Whatever their history, they plan at $0 and are left out of totals, suggestions, the fit plan, the overspending replay and One-Off spending. They are listed in a collapsed **Ended** section under the category table, where you can switch one back. Choose Ended from a category's **Plan as** menu or its popup; changing a whole group's type leaves its Ended categories alone.

After you sign in, category purposes, target edits, essential/flexible choices and floors, exclusions, income, reserves, the shared cushion, group order, and reimbursement matches are saved **per budget in your account** and sync across sessions and browsers. On the first sign-in, existing browser settings are imported when the account has no saved copy. If both copies contain different choices, the app asks which one to keep. These settings never update YNAB. Resetting your plan returns it to your YNAB targets with no shared cushion, and preserves purposes, essential/flexible choices, floors, exclusions, income and reserves.

On a new browser, sign in, enter your YNAB token again, and select the same budget; the saved plan settings will then load from your account. The token itself is not synced.

A category with no YNAB target or entered contribution counts as $0, so totals always calculate; it shows “$0 · not set” so a blank is easy to tell from a real $0. Exclusions affect monthly planning only: actual historical spending and chart bars stay visible. At least one observed month must remain included. Annual and irregular calculations use expected-cost inputs, so their bill months are not removed from funding calculations.

The app loads up to 12 completed budget months, excluding the unfinished current month. It retains zero-spend months where YNAB reports them and does not invent history for new categories. Archived/hidden categories start in One-Off and can be restored. Recorded One-Off spending covers the loaded window, not lifetime costs. Refunds and credits offset historical spending and appear below zero in the chart; recommendations remain nonnegative. This uses net category activity, not gross purchase totals. Amounts are displayed in USD, as in the original app.

YNAB target cadence, current goal metadata and the order of groups and categories come from the current categories endpoint, which lists them as YNAB displays them. Weekly targets use a yearly monthly equivalent (52/12); dated bills use the due-date funding calculation. Undated total-balance goals count as $0 a month until you choose a monthly contribution. Funding credited by YNAB may include payments already made in the goal period; review it when planning a different future bill. Actual income is not auto-identified from category names: enter a confirmed take-home amount.

## Fit to your income

The panel above the table builds a plan you can afford and shows how often each plan would have you moving money.

- **Shared cushion.** One cushion category covers overspending for the whole budget. Its monthly amount is the smallest one (in $5 steps) at which replaying the loaded months, with every line at its realistic amount, covers every shortfall from the cushion without pulling money out of another category. It never goes above what padding each monthly line for its own bad months (its 75th percentile) would cost.
- **Essential or flexible.** Click the chip next to a category, or open it, to mark it. Monthly spending starts flexible and fixed bills, annual, irregular and savings lines start essential. A flexible line has a floor, the least you'd accept per month, which defaults to half its typical month.
- **Fit plan.** When the realistic plan is over your income, flexible lines are trimmed toward their floors in proportion to how much room each has, in $5 steps. Essentials are never trimmed. If flexible room runs out the cushion shrinks next, and anything still over is reported as a choice only you can make.
- **Where to add / Where to cut** lists every difference between your plan and the fit plan, largest first, and says whether a cut only removes padding above your usual spending or asks you to spend less than usual. **Use the fit plan** applies all of it, including the cushion.
- **Moving money.** Each plan is replayed over the loaded months with rollover: every category gets its monthly amount and pays its real spending. When one runs short, it is covered from the cushion first, then from flexible categories with money left, then essential monthly ones; annual, irregular and savings money is never used. Categories start from what they actually held at the start of the window; the cushion starts empty. Excluded outlier months are not replayed. The panel shows how many times you'd have covered overspending, how many of those pulled from other categories, which categories ran short and which were the usual donors. Trimmed lines assume a spending change, so the replay shows them running short until spending actually changes.
- **Rollover in hand.** Money already sitting in flexible lines beyond one typical month is shown as something you can use this month to close a gap without zeroing anything. It does not lower the ongoing amounts, because it runs out once spent.
- A category's detail shows the same replay for that line, its bad-month level, and what YNAB recorded each month: assigned, month-end available, and months it ended overspent.

## Reimbursement tracker

**Reimbursements** lists every transaction in your “Getting Reimbursed” category and any “Credit Card Credits” category (found by name; choose any set of categories) since the tracking start date, which defaults to the first of the month four months back. Split purchases appear as just their reimbursed part. Tick money out and the money in that paid it back, then **Mark as reimbursed**. One payment can cover several items, and several payments can cover one item; edit the proposed amounts before saving, and anything left over stays open. **Ignore** writes off what is still open on an item (listed under Given away, with an optional note). Inflows from Venmo, Zelle, PayPal and similar are labelled payments; others are labelled refunds or credits. With several categories, rows outside the first are labelled with their category.

Split parts take their payee, and their memo when they have none, from the parent transaction (one extra request when needed).

Matches and ignores are saved **per budget in your account** and never change YNAB. Their transaction references and the small snapshots needed to restore those decisions are saved; your YNAB token and full fetched transaction history stay in the browser. Use **Export backup** and **Import backup** to keep an extra copy. If a matched transaction leaves the category or changes amount, the page asks you to keep the rest of the match or undo it; until then its amounts count as open. Ignored items that you recategorize in YNAB simply disappear. If a split is edited and its reimbursed part gets a new id, a single part with the same parent and amount takes over the match.

## Development and deployment

Use Node 22.6+ and npm:

```sh
npm ci
npm run db:push
npm run dev
```

The Replit app uses port 5000 and runs the Express API with Vite in development. `npm run db:push` applies the schema to the development database. It uses Replit-managed Clerk sign-in and PostgreSQL for private saved preferences. The browser connects directly to YNAB; the server never receives the YNAB token or full fetched history.

```sh
npm test
npm run build -- --outDir /tmp/budget-clarity-build
```

The external output directory avoids modifying the repository's previously tracked `dist` files during development. CI runs the calculation tests and production build.

Browser integration checks use a development-only harness, mocked settings storage, and fictional YNAB responses; they do not use a real token or Clerk account. With Python Playwright and Chromium installed, start the dev server and run:

```sh
python tests/browser_smoke.py
python tests/reimbursements_smoke.py
```

`APP_URL`, `CHROMIUM_PATH`, and `SCREENSHOT_DIR` can override the server address, browser executable, and screenshot location. The checks exercise 103 categories, persistence and budget isolation, annual funding, recommendation actions, month exclusions, one-off classifications, income warnings, reports, mobile layouts, and dialog keyboard access. They also compare core visual styles with [the approved design reference](docs/approved-design.html).

For Replit production, publish the app after the development database schema is present. Replit applies managed PostgreSQL schema changes during Publish. The development and production Clerk accounts are separate; create an account in the environment you use.

## Design reference

The implementation copies the approved prototype's colors, typography, spacing, collapsible hierarchy, and popup chart layout. The reference contains fictional examples and is not loaded by the production app. Real connection controls replace its example-data badge, and missing-input messages replace invented financial defaults.
