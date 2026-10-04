# Budget clarity

A personal YNAB dashboard for comparing your spending with your targets, planning for future expenses, and checking that the proposed plan fits your take-home income.

## Using the app

Connect to YNAB with your personal access token, then select a budget. Groups start collapsed; open a group, search for a category, or filter to categories that need attention. Click a category name to review its monthly spending and planning inputs.

- **Monthly need** follows the category's purpose; **Discrepancy** is the current monthly contribution minus that need.
- **Monthly spending** uses the larger of the included-month average and the 75th percentile. A known fixed bill uses its current contribution. Suggested amounts round up to $5.
- **Annual / due-date bills** use the expected amount, funding already credited, and remaining deposits. This assumes a deposit this month and before payment in the due month; revise the date or credited amount when that assumption does not fit.
- **Irregular expenses** use an expected yearly amount divided by 12. A full year of history can provide a starting estimate. Review starting reserves and bill timing; this alone does not guarantee that an early expense is covered.
- **Savings goals** use a chosen contribution, rather than their spending activity.
- **One-Off** categories keep their history but have no recurring allocation. A separate yearly reserve is included once in the monthly plan.

Recommendations, target edits, category purposes, exclusion reasons, income and reserves are saved **per budget in your browser**. They never update YNAB. Opening another browser or clearing its storage does not carry these settings over. Resetting proposed targets preserves purposes, exclusions, income and reserves.

A missing target stays “Not set.” The total is marked incomplete until its proposed contribution is chosen. Exclusions affect monthly planning only: actual historical spending and chart bars stay visible. At least one observed month must remain included. Annual and irregular calculations use expected-cost inputs, so their bill months are not removed from funding calculations.

The app loads up to 12 completed budget months, excluding the unfinished current month. It retains zero-spend months where YNAB reports them and does not invent history for new categories. Archived/hidden categories start in One-Off and can be restored. Recorded One-Off spending covers the loaded window, not lifetime costs. Refunds and credits offset historical spending and appear below zero in the chart; recommendations remain nonnegative. This uses net category activity, not gross purchase totals. Amounts are displayed in USD, as in the original app.

YNAB target cadence and current goal metadata come from the current categories endpoint. Weekly targets use a yearly monthly equivalent (52/12); dated bills use the due-date funding calculation. Undated total-balance goals require a chosen monthly contribution. Funding credited by YNAB may include payments already made in the goal period; review it when planning a different future bill. Actual income is not auto-identified from category names: enter a confirmed take-home amount.

## Development and deployment

Use Node 22.6+ and npm:

```sh
npm ci
npm run dev
```

The development server uses port 5000. For a Vercel deployment, select Vite, run `npm run build`, and publish the `dist` output. The app requires no database or server-side credentials. The user's browser connects directly to YNAB.

```sh
npm test
npm run build -- --outDir /tmp/budget-clarity-build
```

The external output directory avoids modifying the repository's previously tracked `dist` files during development. CI runs the calculation tests and production build.

Browser integration checks use fictional YNAB responses and no real token. With Python Playwright and Chromium installed, start the dev server and run:

```sh
python tests/browser_smoke.py
```

`APP_URL`, `CHROMIUM_PATH`, and `SCREENSHOT_DIR` can override the server address, browser executable, and screenshot location. The checks exercise 103 categories, persistence and budget isolation, annual funding, recommendation actions, month exclusions, one-off classifications, income warnings, reports, mobile layouts, and dialog keyboard access. They also compare core visual styles with [the approved design reference](docs/approved-design.html).

## Design reference

The implementation copies the approved prototype's colors, typography, spacing, collapsible hierarchy, and popup chart layout. The reference contains fictional examples and is not loaded by the production app. Real connection controls replace its example-data badge, and missing-input messages replace invented financial defaults.
