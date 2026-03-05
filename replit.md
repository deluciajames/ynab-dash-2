# YNAB Budget Dashboard

## Overview
A React-based web application for visualizing and managing budget data exported from YNAB (You Need A Budget). Users can upload YNAB CSV exports, detect categories, calculate targets based on naming conventions, and visualize spending patterns using charts.

## Tech Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **UI Components**: Radix UI (Dialog, Select, Slot), Lucide React icons
- **Utilities**: clsx, tailwind-merge, class-variance-authority

## Project Structure
- `src/main.tsx` - Application entry point
- `src/App.tsx` - Main dashboard component
- `src/components/` - UI components
- `src/lib/` - Utility functions
- `vite.config.ts` - Vite configuration (bound to 0.0.0.0:5000 for Replit)
- `index.html` - HTML entry point

## Running the App
- Dev server: `npm run dev` (runs on port 5000)
- Build: `npm run build`
- Preview: `npm run preview`

## Environment
- Node.js 20
- npm for package management
