---
trigger: model_decision
description: Repository-specific quirks, performance pitfalls, and lessons learned
---

# Repository Quirks & Pitfalls

This document captures "Lessons Learned" from past mistakes and specific repository quirks.

## 1. WatermelonDB & Persistence
- **Bridge Overload**: Large batch updates can freeze the React Native bridge. Keep batch sizes around 500 records.
- **Atomic Batches**: Ensure related records (Journal/Transactions) are batched together.
- **Record Caching**: `prepareCreate` records are NOT available until commit.
- **Singleton Database**: Always import `database` from `@/src/data/database/Database`. Never re-instantiate.

## 2. Performance & UI
- **Observable Overkill**: Don't observe everything. High-frequency updates can cause lag.
- **Keyboard & Footers**: Layouts with bottom-anchored footers often break. Use `KeyboardAvoidingView`.
- **Currency Precision**: Looking up precision in a loop is expensive. Use `BalanceService`.
- **Custom Pickers**: Always use `@/src/components/common/CustomDateTimePicker`. Do not install external libraries.

## 3. State & Logic
- **Rerender Loops**: Be careful with observable hooks in components that also update state.
- **Net Worth Paradox**: Net worth must always be a pure projection. Never cache it in a separate DB table.
- **Running Balance Cache**: The `running_balance` column is a cache only. Only `AccountingRebuildService` should write to it.

## 4. Design System
- **Color Token Blast Radius**: Changes to design-system primitives (`utils.ts`, color tokens) cascade to 15+ consuming files. Always verify downstream components after touching design-system internals.

## 5. Simulation & Accounting
- **Sign Convention Consistency**: Debit-positive vs credit-positive sign conventions must be identical across simulation, reports, wealth-service, and accounting helpers. A single mismatch causes silent numerical errors app-wide.
- **Multi-Currency Normalization**: Planned Payment and Planned Journal amounts must be normalized to the result/base currency before entering simulation engines. Omitting this produces silently wrong forecast totals.
- **Inclusive Date Boundary Off-by-One**: Date range calculations (especially "today" inclusion) in services and simulations are a recurring bug source. Always verify inclusive vs exclusive boundaries and add edge-case tests.

## 6. Charts & Visualization
- **Chart Gesture Duplication**: All chart interaction/tooltip logic must go through `useChartInteraction`. Do not duplicate gesture handling in individual chart components (`AreaChart`, `BarChart`, `LineChart`, etc.).

## 7. Environment & Tooling
- **Bun, Not npm**: This project uses `bun` as its package manager and script runner. Never use `npm install`, `npm run`, or `npx`. Use `bun install`, `bun run`, and `bunx` instead.
- **Expo Versioning**: Upgrading Expo is high-risk. Always verify plugin compatibility (especially WatermelonDB) before committing. A previous Expo 55 upgrade had to be reverted.
