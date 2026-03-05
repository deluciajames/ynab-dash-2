# YNAB Budget Dashboard

A React-based dashboard for visualizing and managing your YNAB (You Need A Budget) data via the YNAB API.

## Features

- **YNAB API Integration**: Connect with your Personal Access Token to import budget data directly
- **Persistent Connection**: Your API token is stored locally in the browser so you don't need to re-enter it
- **Budget Selection**: Choose from your available YNAB budgets
- **Smart Category Detection**: Automatically identifies Category Groups vs Categories
- **Intelligent Target Calculation**:
  - `[MONTH]` prefix (e.g., `[JAN]`) - Annual charge, target = charge / 12
  - `[number]` prefix (e.g., `[1]`) - Monthly fixed charge, target = most recent amount
  - `[x]` prefix or checkmark emoji - Completed/cancelled, target = $0
  - `[Flex]` prefix - Flexible expense
- **KPI Boxes**: Track Total Targets, Monthly Income, Planned Savings, and Remaining budget
- **Collapsible Groups**: Expand/collapse category groups for cleaner viewing
- **Side Panel**: Click any category to see charts and insights
- **Date Range Filter**: Focus on specific months

## Getting Started

### Replit
1. Click "Run" to start the development server
2. Click "Connect to YNAB" and enter your Personal Access Token
3. Select a budget to view your data

### Local Development
```bash
npm install
npm run dev
```

## Usage

1. Get a Personal Access Token from [YNAB Developer Settings](https://app.ynab.com/settings/developer)
2. Click "Connect to YNAB" in the dashboard
3. Paste your token and click Connect
4. Select a budget from the dropdown
5. Set your Monthly Income and Planned Savings
6. Adjust targets as needed
7. Click on categories to see detailed charts

## Tech Stack

- React 18 + TypeScript
- Tailwind CSS
- Recharts for data visualization
- Vite for bundling
