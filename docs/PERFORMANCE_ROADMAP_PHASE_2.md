# Performance Roadmap Phase 2: From Fast to Instant

This document outlines the architectural shifts required to achieve "instant-feel" responsiveness and sub-1s cold starts.

## 1. Lazy Bootstrapping (Priority: Immediate)
**Problem:** Non-critical services (Analytics, Sentry, Integrity Checks) compete for the CPU and bridge during the first 500ms of app startup.
**Goal:** Defer all non-essential logic until the Dashboard is "Fully Ready."
**Plan:**
- Move `Sentry.init` to the absolute top of `index.js` to resolve race conditions.
- Defer `analytics.initialize()` and `identify()` until after `setDataHydrated(true)`.
- Move `IntegrityService` and `SmsService` processing to a 5-second delayed background task.

## 2. Database Indexing Audit
**Problem:** SQL performance on the `transactions` table will degrade as data grows.
**Goal:** Ensure O(1) or O(log N) lookup time for all Dashboard and Account List queries.
**Plan:**
- Add compound indices on `(workplace_id, deleted_at, transaction_date)`.
- Index `journal_id` on the `transactions` table.
- Use `EXPLAIN QUERY PLAN` to verify that no full table scans occur during startup.

## 3. Background Worker Offloading (Worklets)
**Problem:** Heavy analytical queries (Insights, Pattern Matching) run on the main JS thread, causing micro-stutters.
**Goal:** Offload background logic to secondary threads.
**Plan:**
- Use `react-native-worklets` to run `InsightService` logic.
- Ensure the UI remains 60FPS even while the app identifies "Spending Leaks" in the background.

## 4. Native Simulation Migration (Nitro)
**Problem:** The 60-day cash flow simulation is a math-heavy JS loop (~40-150ms).
**Goal:** Sub-5ms simulation execution.
**Plan:**
- Implement the `CashFlowSimulationService` logic in C++/Kotlin/Swift using `react-native-nitro-modules`.
- Bypasses the JS bridge entirely for simulation math.

## 5. Instant Boot Cache (MMKV Snapshots)
**Problem:** Users see a loading skeleton while the database hydrates.
**Goal:** <50ms "Time to First Meaningful Content."
**Plan:**
- Persist a JSON snapshot of `DashboardData` to MMKV on every change.
- On boot, `useDashboardViewModel` returns the snapshot immediately.
- The "real" database query runs in the background and swaps the data once ready.
