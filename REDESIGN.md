# YNAB Budget Dashboard — Redesign Suggestions

> Informed by [Refero.design](https://refero.design/) design research platform and modern fintech/dashboard UI patterns (2025–2026 trends).

---

## Current State Assessment

The current app is a functional React + TypeScript SPA that connects to the YNAB API and displays budget analysis with percentile-based spending insights. It uses Tailwind CSS with default configuration, Radix UI primitives, Recharts for charting, and Lucide icons.

**What works well:**
- Clean, professional baseline aesthetic
- Smart data model (percentile analysis, sinking fund detection, buffer calculations)
- Good use of color-coding for data semantics (blue = primary, green = positive, red = negative, purple = buffer)
- Collapsible category groups with expand/collapse
- Right-side detail panel with bar chart

**What needs improvement:**
- Generic, template-like visual identity — looks like a Tailwind starter rather than a polished product
- Single-page table-heavy layout with no visual rhythm or breathing room
- No dark mode (expected in 2025+ finance tools)
- Flat information hierarchy — KPI cards, table, and explainer all feel like equal weight
- Limited data visualization — only one bar chart (in the sidebar), table does all the heavy lifting
- No onboarding experience — bare "enter your token" flow
- No responsive mobile consideration
- No typography system (uses system fonts with no hierarchy refinement)
- Side panel feels disconnected from the main content

---

## Redesign Suggestions

### 1. Establish a Design System & Visual Identity

**Typography**
- Adopt a modern font pairing: **Inter** for UI text (clean, variable weight, designed for screens) + **JetBrains Mono** for currency/numbers (monospace alignment in tables)
- Define a clear type scale: display (32px), heading (24px), subhead (18px), body (14px), caption (12px)
- Use tabular figures (`font-variant-numeric: tabular-nums`) for all currency columns to ensure alignment

**Color System**
Extend the Tailwind config with a custom semantic palette:
```
Primary:     #2563EB (blue-600) → brand, active states, links
Secondary:   #7C3AED (violet-600) → buffer, secondary metrics
Success:     #059669 (emerald-600) → positive balances, under-budget
Warning:     #D97706 (amber-600) → sinking funds, caution states
Danger:      #DC2626 (red-600) → over-budget, errors
Surface:     #FAFBFC → card backgrounds
Background:  #F1F5F9 → page background
Foreground:  #0F172A → primary text
Muted:       #64748B → secondary text
```

**Dark Mode**
- Add a dark mode toggle in the header using Tailwind's `dark:` variant
- Dark surfaces: `#0F1117` (background), `#1A1D27` (cards), `#252830` (elevated)
- Finance apps benefit heavily from dark mode — numbers pop, eye strain reduces for daily use

**Spacing & Rhythm**
- Use a consistent 8px grid (Tailwind's default scale)
- Add more vertical spacing between sections (currently too compressed)

### 2. Redesign the Layout Architecture

**Current:** Single scrolling column with header → KPIs → table → explainer

**Proposed:** Multi-panel dashboard layout inspired by apps like [Copilot Money](https://copilot.money), [Monarch](https://monarchmoney.com), and [Lunch Money](https://lunchmoney.app)

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Logo · Budget Selector · Refresh · Settings · User │
├────────────────────────────┬────────────────────────────────┤
│                            │                                │
│   Summary Section          │   Trend Visualization          │
│   (KPI cards + donut)      │   (Spending over time chart)   │
│                            │                                │
├────────────────────────────┴────────────────────────────────┤
│                                                             │
│   Category Budget Table (full width, collapsible groups)    │
│   with inline sparklines per category                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│   Insights Bar: "You're $340 under budget this month" etc.  │
└─────────────────────────────────────────────────────────────┘
```

**Key changes:**
- **Top section splits into two panels**: Left has KPI summary cards, right has a time-series area/line chart showing spending trend over the 12 months
- **Table gets full width** below the summary section
- **Category detail** becomes a slide-over drawer (already exists) but with richer content
- **Insights bar** at the bottom replaces the current explainer text with actionable, personalized insights

### 3. Enhance the KPI Cards

**Current:** Three flat white cards in a row (Monthly Budget, Buffer, Remaining)

**Proposed redesign:**

- **Add a 4th card**: "Monthly Spending" showing actual spend vs. budget with a mini progress ring
- **Add sparklines** inside each card showing the metric's trend over time
- **Use gradient backgrounds** subtly (e.g., blue-50 → white gradient) instead of flat white
- **Add comparison indicators**: "+12% vs last month" with up/down arrows
- **Animate numbers** on load with a count-up effect (using `framer-motion` or CSS)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 📊 Budget    │  │ 🛡️ Buffer    │  │ 💰 Remaining │  │ 📈 vs. Last  │
│              │  │              │  │              │  │    Month     │
│  $4,250      │  │  $680        │  │  $750        │  │  -8.2%       │
│  ~~~~~~~~~~  │  │  ~~~~~~~~~~  │  │  ~~~~~~~~~~  │  │  ~~~~~~~~~~  │
│  (sparkline) │  │  (sparkline) │  │  (sparkline) │  │  (sparkline) │
│  At P75      │  │  P75→P90 gap │  │  Under ✓     │  │  Trending ↓  │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

### 4. Add a Spending Trend Chart

The current app has **no overview chart** on the main page (only in the detail sidebar). Add a prominent area chart in the top section:

- **Stacked area chart** showing monthly spending by category group over the 12-month window
- Or a **dual-line chart**: one line for total spending, one for the selected confidence target
- Interactive: hover shows month breakdown, click drills into that month
- Use Recharts' `AreaChart` with gradient fills (blue gradient for spending, dashed line for target)
- This gives immediate visual context that the table alone cannot

### 5. Upgrade the Data Table

**Inline Sparklines**
- Add a tiny sparkline (50px wide) next to each category name showing its 12-month spending pattern
- This immediately reveals trends (seasonal spikes, steady, increasing) without needing to click

**Progress Bars for Budget Utilization**
- Replace or supplement raw P50/P75/P90 numbers with horizontal bar segments
- Visual: `[████████░░]` showing where the selected confidence level falls relative to P90

**Improved Row Design**
- Increase row height slightly (40px → 48px) for better readability
- Add subtle left-border color coding per group (like colored category indicators in YNAB itself)
- Use alternating row backgrounds more subtly (`odd:bg-slate-25`)

**Sticky Header + Footer**
- Make the table header sticky on scroll (`position: sticky; top: 0`)
- Make the total row sticky at the bottom so it's always visible

**Search/Filter**
- Add a search input above the table to filter categories by name
- Add filter chips: "All", "Regular", "Sinking Funds", "Over Budget"

### 6. Redesign the Category Detail Panel

**Current:** Right slide-over with average, total, bar chart, and month list

**Proposed enhancements:**

- **Header**: Category name + group badge + type pill (Regular/Sinking)
- **Stat cards row**: Average, Median, Max, Min (2x2 grid)
- **Primary chart**: Replace bar chart with a **combined chart** — area fill showing spending with a horizontal dashed line at the target amount, making over/under months visually obvious
- **Percentile visualization**: A simple horizontal range bar showing P50-P75-P90 with the current target marked
- **Month table**: Keep but add conditional formatting — highlight months that exceeded the target in amber/red
- **Quick actions**: "Set as target in YNAB" link (deep link to YNAB app category)

### 7. Improve the Onboarding Flow

**Current:** Empty state with "Connect to YNAB" text + separate modal for API key

**Proposed:** A guided multi-step onboarding:

1. **Welcome screen** with hero illustration and value proposition: "See where your money actually goes — powered by your YNAB data"
2. **Connect step** with clear instructions, animated illustration of the flow, and a single input for the token
3. **Budget selection** as an inline step (not a separate dropdown)
4. **Data loading** with a skeleton loader showing the dashboard structure filling in progressively
5. **First-use tooltip** highlighting the confidence level selector: "Start here — choose how conservative you want your budget"

### 8. Add Micro-interactions & Polish

- **Skeleton loaders** instead of the spinning loader — show ghost cards and table rows that match the actual layout
- **Smooth transitions** when switching confidence levels (animate the numbers and highlighted columns)
- **Hover previews** on table rows — show a mini tooltip with the category's sparkline and key stats
- **Animate sidebar** entry with a spring slide-in (not instant mount)
- **Toast notifications** for actions: "Data refreshed", "Budget updated", etc.
- **Keyboard shortcuts**: `1/2/3` for confidence levels, `Esc` to close sidebar, `/` to search

### 9. Responsive Design

The current layout breaks on small screens. Add responsive breakpoints:

- **Desktop (1200px+)**: Full layout as designed above
- **Tablet (768–1199px)**: KPI cards in 2x2 grid, chart below cards, table with horizontal scroll
- **Mobile (< 768px)**:
  - Stacked single-column layout
  - KPI cards as a horizontal swipeable row
  - Category groups as expandable accordion cards (not a table)
  - Detail panel becomes a bottom sheet instead of right sidebar
  - Touch-friendly tap targets (48px minimum)

### 10. Progressive Feature Additions

**Phase 1 — Visual Polish (Quick Wins)**
- [ ] Add Inter + JetBrains Mono fonts
- [ ] Extend Tailwind config with custom color palette
- [ ] Add dark mode support
- [ ] Improve typography scale and spacing
- [ ] Add skeleton loaders
- [ ] Make table header sticky
- [ ] Add tabular-nums to all currency values

**Phase 2 — Enhanced Visualization**
- [ ] Add spending trend area chart to main page
- [ ] Add inline sparklines to table rows
- [ ] Add progress bar segments for budget utilization
- [ ] Enhance KPI cards with sparklines and comparisons
- [ ] Animate number transitions

**Phase 3 — UX Improvements**
- [ ] Redesign onboarding flow
- [ ] Add category search/filter
- [ ] Add keyboard shortcuts
- [ ] Enhance the detail panel with combined chart + percentile viz
- [ ] Add toast notifications
- [ ] Responsive mobile layout

**Phase 4 — Advanced Features**
- [ ] Month-over-month comparison view
- [ ] Budget vs. actual tracking gauge
- [ ] Export to CSV/PDF
- [ ] Custom date range selector (not just last 12 months)
- [ ] Category-level goal setting

---

## Refero MCP Integration

[Refero](https://refero.design/) provides an MCP server at [refero.design/mcp](https://refero.design/mcp) that gives AI agents access to 124,000+ real product screens for design research. To use it for ongoing design decisions:

**Setup**: Add Refero MCP to your Claude Code configuration to enable searching Refero's design library directly during development. This allows you to:
- Search for "finance dashboard" UI patterns from real products
- Browse "budget tracker" and "spending analytics" interfaces
- Find specific component patterns (data tables, KPI cards, chart layouts)
- Reference how top fintech apps handle dark mode, onboarding, and data density

**Recommended Refero searches for this project:**
- "Budget dashboard" — see how Mint, Monarch, Copilot handle budget overviews
- "Data table with sparklines" — find table designs that embed mini charts
- "Finance KPI cards" — card layouts for financial metrics
- "Dark mode dashboard" — dark theme implementations for data-heavy apps
- "Onboarding finance app" — step-by-step connection flows

---

## Summary

The YNAB Budget Dashboard has a strong analytical foundation. The redesign focuses on three pillars:

1. **Visual Identity** — Move from generic Tailwind defaults to a purposeful, fintech-grade design system with custom typography, semantic colors, and dark mode
2. **Data Storytelling** — Add charts, sparklines, and trend indicators so users can see patterns at a glance, not just numbers in a table
3. **User Experience** — Smooth onboarding, responsive layout, keyboard shortcuts, and micro-interactions that make the tool feel polished and delightful to use daily

These suggestions draw from patterns observed across top finance apps catalogued in [Refero's 124k+ screen library](https://refero.design/) and align with [2025–2026 dashboard design principles](https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/) emphasizing clarity, trust, and actionable insights.
