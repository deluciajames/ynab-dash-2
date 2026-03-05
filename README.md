# YNAB Budget Dashboard

A React-based dashboard for visualizing and managing your YNAB (You Need A Budget) export data.

## Features

- **CSV Upload**: Upload your YNAB Reports Export and automatically parse it
- **Smart Category Detection**: Automatically identifies Category Groups vs Categories using sum-matching
- **Intelligent Target Calculation**:
  - `[MONTH]` prefix (e.g., `[JAN]`) → Annual charge, target = charge ÷ 12
  - `[number]` prefix (e.g., `[1]`) → Monthly fixed charge, target = most recent amount
  - `[x]` prefix or ✅ emoji → Completed/cancelled, target = $0
  - `[Flex]` prefix → Flexible expense
- **KPI Boxes**: Track Total Targets, Monthly Income, Planned Savings, and Remaining budget
- **Collapsible Groups**: Expand/collapse category groups for cleaner viewing
- **Side Panel**: Click any category to see charts and insights
- **Date Range Filter**: Focus on specific months

## Getting Started

### Replit
1. Create a new Replit with the "React TypeScript" template
2. Upload these files
3. Click "Run"

### Local Development
```bash
npm install
npm run dev
```

## Usage

1. Export your YNAB data as a CSV (Reports → Income vs Expense)
2. Click "Upload CSV" in the dashboard
3. Set your Monthly Income and Planned Savings
4. Adjust targets as needed
5. Click on categories to see detailed charts

## Tech Stack

- React 18 + TypeScript
- Tailwind CSS
- Recharts for data visualization
- Vite for bundling
