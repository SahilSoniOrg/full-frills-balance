---
trigger: model_decision
description: Repository-specific quirks, performance pitfalls, and lessons learned
---

# Repository Quirks & Pitfalls
Lessons learned from past issues, organized by principles.

## 1. WatermelonDB & Persistence
- **Bridge Overload [KISS]**: Batch updates > 500 records freeze the RN bridge; keep sizes bounded.
- **Atomic Batches [KISS]**: Save related Journal/Transactions in a single transaction batch.
- **Caching Boundary [KISS]**: `prepareCreate` records are not queryable until fully committed.
- **Singleton DB [DRY]**: Always import the shared database from `@/src/data/database/Database`.
- **Workplace Cache Isolation [KISS]**: Always prefix or wrap MMKV/Snapshot cache keys with `workplaceId` to prevent cross-workspace data leakage when switching workplaces.
- **Cache TTL Validation [KISS]**: Implement strict maximum age validations (e.g., 2-day TTL) when loading snapshots from MMKV to prevent displaying stale cached states on boot.

## 2. Performance & UI
- **Observable Overkill [KISS]**: Selective and debounced observers only; high-frequency triggers lag.
- **Footers & Keyboard [KISS]**: Always use `KeyboardAvoidingView` to prevent bottom footer breaks.
- **Currency Precision [DRY]**: Avoid in-loop lookups; utilize `BalanceService` cache.
- **Custom Pickers [DRY]**: Never install pickers; use `@/src/components/common/CustomDateTimePicker`.
- **Instant Boot Cache [KISS]**: Cache simulation JSON via `SnapshotService` to MMKV; do not block boot.
- **Android Text Clipping [Clean Code]**: Set parent `flexShrink: 1`/`flex: 1` and text `numberOfLines={1}`/`adjustsFontSizeToFit`.
- **Rounded Line Heights [Clean Code]**: Use integer line heights to prevent Android font clipping.
- **Unique List Keys [KISS]**: Always assign explicit unique React keys (like `id`) to mapped list item props/badges to avoid duplicate re-render loops during scroll updates.

## 3. State & Logic
- **Rerender Loops [KISS]**: Avoid components combining React state mutations with observable hooks.
- **Net Worth Projection [KISS]**: Net worth must remain a pure projection; never cache in DB tables.
- **Running Balance [DRY/SRP]**: `running_balance` is a cache written only by `AccountingRebuildService`.
- **Search Recall [Clean Code]**: Overlays must search secondary fields (like notes) in addition to names.
- **Telemetry Permission Warnings [Clean Code]**: Handle expected permission rejections (e.g., `PermissionError`) by logging them as warnings instead of errors to avoid alert telemetry pollution.
- **Onboarding Transition [KISS]**: Force explicit routing using `AppNavigation.toDashboard()` upon onboarding wizard completion to guarantee screen boundary transitions.

## 4. Design System
- **Color Cascade [Clean Code]**: Verifying downstream consumers is mandatory when updating color tokens.

## 5. Simulation & Accounting
- **Sign Invariance [SRP/Clean Code]**: Debit/credit positive signs must be uniform across wealth, reports, and sims.
- **Sim Normalization [DRY]**: Normalize amounts to base currency before processing in simulation engines.
- **Off-by-Ones [Clean Code]**: Carefully test inclusive/exclusive boundaries for date range algorithms.
- **Budget Invariant [SRP]**: Budgets require ≥ 1 source account; prevent empty account configurations.

## 6. Charts & Gestures
- **Gestures [DRY]**: All chart gesture logic must consume the unified `useChartInteraction` hook.

## 7. Tooling & Expo
- **Bun Runner [KISS]**: Always run `bun install`, `bun run`, and `bunx` instead of npm.
- **Expo Upgrades [KISS]**: Upgrades are high-risk; verify WatermelonDB plugin compatibility first.
