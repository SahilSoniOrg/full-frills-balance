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

## 4. Environment & Tooling
- **Expo Versioning**: Upgrading Expo is high-risk. Always verify plugin compatibility (especially WatermelonDB) before committing. A previous Expo 55 upgrade had to be reverted.
