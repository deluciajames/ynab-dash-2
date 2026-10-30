# Budget Clarity

## Overview
A React and Express app that connects directly to YNAB to compare spending with planned targets, plan future bills, and track reimbursements.

## Core Logic
- **Planning**: Category purposes, suggested contributions, reserves, exclusions, take-home income, and group ordering.
- **Reimbursements**: Match YNAB outflows to repayments and retain ignore decisions.
- **Private sync**: Clerk identifies the account; PostgreSQL settings are keyed by Clerk user ID and YNAB budget ID.

## Tech Stack
- **Framework**: React 18 with TypeScript
- **Server**: Express with Vite middleware in development
- **Authentication**: Replit-managed Clerk
- **Database**: Replit-managed PostgreSQL via `pg`
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Charts**: Recharts, @nivo/sankey (Sankey flow diagrams)
- **Icons**: Lucide React
- **Utilities**: clsx, tailwind-merge, class-variance-authority

## Data Flow
1. Users sign in with Clerk before opening the budget workspace.
2. The browser stores the YNAB token and connects directly to YNAB.
3. Fetched budget history and categories remain in browser storage.
4. Planning choices and reimbursement match state sync to PostgreSQL by signed-in user and budget.
5. Existing browser settings migrate on first sync; conflicting browser/account copies require an explicit choice.

## Project Structure
- `src/main.tsx` - Application entry point
- `src/AuthApp.tsx` - Public landing page, Clerk sign-in routes, and protected app route
- `src/App.tsx` - Main shell: YNAB connection, planning, reports, reimbursement tracker, and settings sync
- `server/index.mjs` - Express API, Clerk middleware, and Vite/static serving
- `server/schema.sql` - Source schema for persisted per-budget preferences
- `src/api/ynab.ts` - YNAB REST API client
- `src/api/transform.ts` - Transforms YNAB API responses into Category/CategoryGroup types
- `src/api/percentiles.ts` - Percentile calculation engine (P50/P75/P90, sinking fund detection, buffer math)
- `src/hooks/useApiKey.ts` - React hooks for API key and budget ID localStorage persistence
- `src/hooks/useCachedBudgetData.ts` - Caches transformed budget data in localStorage keyed by budget ID
- `src/hooks/useGroupSortOrder.ts` - Persists custom category group sort order in localStorage
- `src/hooks/useCategoryOverrides.ts` - Per-category target/buffer overrides with lock state, persisted in localStorage
- `src/hooks/useCloudPreferences.ts` - Loads, imports, and syncs account preferences; prompts on conflicts
- `src/components/SortGroupsModal.tsx` - Drag-and-drop modal for reordering category groups
- `src/components/TargetCalculator.tsx` - Main report UI with confidence toggle, summary cards, category table
- `src/components/SankeyReport.tsx` - Sankey flow chart showing income → expense groups → categories + remaining
- `src/components/ApiKeyDialog.tsx` - Token input/connection management dialog
- `src/components/BudgetSelector.tsx` - Budget picker dropdown
- `vite.config.ts` - Vite config (bound to 0.0.0.0:5000 for Replit)

## Running the App
- Install dependencies: `npm ci`
- Development workflow: `npm run dev` (Express and Vite on port 5000)
- Production server: `npm start` after `npm run build`
- Build: `npm run build`
- Tests: `npm test`
- Use **Start application** to open the preview, create/sign in to an account, then connect YNAB.
- Replit-managed PostgreSQL schema changes are applied to production by the Publish flow; do not run schema DDL at server startup.

## Environment
- Node.js 22.6+ (Replit uses the Node.js 22 module)
- Replit-managed Clerk and PostgreSQL are provisioned for the app.
- npm for package management

## Notes
- YNAB API token and full fetched transaction history remain in browser storage; neither is sent to this app's server.
- The database stores planning preferences and reimbursement decisions, including compact snapshots of transactions explicitly matched or ignored.
- Every settings query is scoped to the authenticated Clerk user and the YNAB budget ID.
- YNAB API amounts are in milliunits (divided by 1000 for dollars)
- The app fetches each month individually since the YNAB months list endpoint doesn't include category data
