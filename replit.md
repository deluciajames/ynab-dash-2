# YNAB Budget Dashboard

## Overview
A React-based budget calculator that connects to the YNAB API and uses percentile analysis to recommend spending targets. Instead of showing raw monthly data, it calculates the 50th, 75th, and 90th percentile of your spending per category over the last 12 months, helping you set data-driven budget targets.

## Core Logic
- **Regular categories**: Shows P50 (lean), P75 (balanced), P90 (safe) percentiles from spending history
- **Irregular/sinking fund categories**: Detected when 4+ months have zero spending; uses total annual spend / 12 as a monthly accrual amount
- **Buffer calculation**: Sum of (P90 - P75) across all regular categories — a single monthly amount to cover overages
- **Confidence toggle**: Switch between 50th/75th/90th percentile to see how total budget changes
- **Over-budget warning**: Optional take-home income input triggers a warning if budget exceeds income

## Tech Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **Utilities**: clsx, tailwind-merge, class-variance-authority

## Data Flow
1. User enters YNAB Personal Access Token (stored in browser localStorage)
2. App fetches available budgets from YNAB API
3. User selects a budget (also persisted in localStorage)
4. App checks localStorage cache for budget data; if cached, loads instantly without API call
5. On first load or explicit "Refresh" click, fetches last 12 months via YNAB API, then caches the result
6. Transform layer extracts categories, groups, and monthly spending data
7. Percentile engine calculates P50/P75/P90, detects sinking funds, computes buffer amounts
8. TargetCalculator component renders the report with interactive confidence toggle
9. "Last updated" timestamp shown next to Refresh button so user knows data freshness

## Project Structure
- `src/main.tsx` - Application entry point
- `src/App.tsx` - Main shell: YNAB connection, data loading, category detail sidebar
- `src/api/ynab.ts` - YNAB REST API client
- `src/api/transform.ts` - Transforms YNAB API responses into Category/CategoryGroup types
- `src/api/percentiles.ts` - Percentile calculation engine (P50/P75/P90, sinking fund detection, buffer math)
- `src/hooks/useApiKey.ts` - React hooks for API key and budget ID localStorage persistence
- `src/hooks/useCachedBudgetData.ts` - Caches transformed budget data in localStorage keyed by budget ID
- `src/hooks/useGroupSortOrder.ts` - Persists custom category group sort order in localStorage
- `src/components/SortGroupsModal.tsx` - Drag-and-drop modal for reordering category groups
- `src/components/TargetCalculator.tsx` - Main report UI with confidence toggle, summary cards, category table
- `src/components/ApiKeyDialog.tsx` - Token input/connection management dialog
- `src/components/BudgetSelector.tsx` - Budget picker dropdown
- `vite.config.ts` - Vite config (bound to 0.0.0.0:5000 for Replit)

## Running the App
- Dev server: `npm run dev` (runs on port 5000)
- Build: `npm run build`

## Environment
- Node.js 20
- npm for package management

## Notes
- YNAB API token is stored in browser localStorage, never sent to any server other than YNAB
- YNAB API amounts are in milliunits (divided by 1000 for dollars)
- The app fetches each month individually since the YNAB months list endpoint doesn't include category data
