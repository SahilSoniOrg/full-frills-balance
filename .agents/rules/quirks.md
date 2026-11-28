---
trigger: model_decision
description: Repository-specific quirks, performance pitfalls, and lessons learned
---

# Repository Quirks & Pitfalls

## WatermelonDB & Persistence
- **Bridge Overload [KISS]**: Batch updates > 500 records freeze the RN bridge; keep sizes bounded.
- **Atomic Batches [KISS]**: Save related Journal/Transactions in a single transaction batch.
- **Caching Boundary [KISS]**: `prepareCreate` records are not queryable until fully committed.
- **Singleton DB [DRY]**: Import shared DB from `@/src/data/database/Database`.
- **Workplace Cache Isolation [KISS]**: Prefix MMKV/Snapshot keys with `workplaceId` to prevent cross-workspace leakage on switch.
- **Cache TTL Validation [KISS]**: Enforce max age (e.g. 2-day TTL) when loading MMKV snapshots on boot.

## Performance & UI
- **Observable Overkill [KISS]**: Selective, debounced observers only; high-frequency triggers lag.
- **Footers & Keyboard [KISS]**: Use `KeyboardAvoidingView` so bottom footers survive keyboard open.
- **Currency Precision [DRY]**: No in-loop precision lookups; use `BalanceService` cache.
- **Instant Boot Cache [KISS]**: Cache simulation JSON via `SnapshotService` to MMKV; do not block boot.
- **Android Text Clipping [Clean Code]**: Parent `flexShrink: 1`/`flex: 1`; text `numberOfLines={1}`/`adjustsFontSizeToFit`.
- **Rounded Line Heights [Clean Code]**: Integer line heights on Android to avoid font clipping.
- **Unique List Keys [KISS]**: Explicit stable keys (`id`) on list badges/props to avoid scroll re-render loops.

## State & Logic
- **Rerender Loops [KISS]**: Do not mix React state mutations with observable hooks in one component.
- **Running Balance [DRY/SRP]**: `running_balance` written only by `AccountingRebuildService`.
- **Search Recall [Clean Code]**: Overlays search secondary fields (e.g. notes) as well as names.
- **Telemetry Permission Warnings [Clean Code]**: Log expected `PermissionError` as warn, not error (telemetry).
- **Onboarding Transition [KISS]**: On wizard completion, route via `AppNavigation.toDashboard()` for clean boundary.

## Design System
- **Color Cascade [Clean Code]**: When changing color tokens, verify downstream consumers.

## Simulation & Accounting
- **Sign Invariance [SRP/Clean Code]**: Debit/credit sign conventions uniform across wealth, reports, sims.
- **Sim Normalization [DRY]**: Normalize to base currency before simulation engine processing.
- **Off-by-Ones [Clean Code]**: Test inclusive/exclusive boundaries on date-range logic.
- **Budget Invariant [SRP]**: Budgets need ≥ 1 source account; block empty configurations.

## Charts & Gestures
- **Gestures [DRY]**: Chart gestures via unified `useChartInteraction` only.

## Tooling & Expo
- **Bun Runner [KISS]**: `bun install`, `bun run`, `bunx` — not npm.
- **Expo Upgrades [KISS]**: High risk; verify WatermelonDB plugin compatibility first.
