# YNAB Budget Dashboard

## Overview
A React-based web application that connects to the YNAB (You Need A Budget) API to visualize and manage budget data. Users authenticate with a Personal Access Token, select a budget, and view spending patterns with charts, KPIs, and a detailed category table.

## Tech Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **UI Components**: Lucide React icons
- **Utilities**: clsx, tailwind-merge, class-variance-authority

## Data Flow
1. User enters YNAB Personal Access Token (stored in browser localStorage for persistence)
2. App fetches available budgets from YNAB API
3. User selects a budget (selection also persisted in localStorage)
4. App fetches monthly budget data and transforms it into dashboard-friendly structures
5. Dashboard renders KPIs, category table, and chart details

## Project Structure
- `src/main.tsx` - Application entry point
- `src/App.tsx` - Main dashboard component with state management
- `src/api/ynab.ts` - YNAB REST API client (fetches budgets, months, categories)
- `src/api/transform.ts` - Transforms YNAB API data into app's Category/CategoryGroup types
- `src/hooks/useApiKey.ts` - React hooks for API key and budget ID persistence (localStorage)
- `src/components/ApiKeyDialog.tsx` - Token input/connection management dialog
- `src/components/BudgetSelector.tsx` - Budget picker dropdown
- `vite.config.ts` - Vite configuration (bound to 0.0.0.0:5000 for Replit)
- `index.html` - HTML entry point

## Running the App
- Dev server: `npm run dev` (runs on port 5000)
- Build: `npm run build`
- Preview: `npm run preview`

## Environment
- Node.js 20
- npm for package management

## Notes
- The YNAB API token is stored in the browser's localStorage, not on any server
- YNAB API amounts are in milliunits (divide by 1000 for dollars)
- Category prefix analysis ([Flex], [1], [JAN], etc.) is preserved from the original CSV-based logic
