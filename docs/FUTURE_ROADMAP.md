# Future Roadmap

**Active engineering queue:** see [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (post–2026-07 audit).

## Phase 1: Polish & Hardening (Current)
- [ ] **Simulation V2 Native Migration**: Move heavy simulation math to a native module for sub-10ms execution.
- [ ] **Expanded Test Coverage**: Add dedicated tests for hub, commitments, and newer UI features.
- [ ] **Import Validation**: Harden Ivy Wallet and Cashew import plugins for malformed file edge cases.
- [ ] **Chart Gesture Refinement**: Continue improving Pan/Tap disambiguation on scroll-heavy screens.

## Phase 2: Data Safety & Portability
- [ ] **Encrypted Backup**: Local file-based encrypted backup with passphrase.
- [ ] **CSV Export**: Export journal data as CSV for spreadsheet analysis.
- [ ] **Selective Export**: Export filtered date ranges instead of full dump.

## Phase 3: Intelligence
- [ ] **Full Frills Academy**: In-app educational content (financial literacy lessons triggered by user behavior).
- [ ] **Spending Anomaly Detection**: Alert when a category exceeds historical averages.
- [ ] **Budget Auto-Suggestions**: Recommend budget amounts based on past spending patterns.

## Phase 4: Platform Expansion
- [ ] **iOS Widget**: Extend the Android widget to iOS using WidgetKit.
- [ ] **Background SMS Parsing**: Real-time SMS monitoring (requires privacy policy update).
- [ ] **Split/Comparative Views**: Side-by-side month/year comparisons in Reports.

---

## Completed (formerly roadmap items)
- [x] ~~Biometric Lock (FaceID/TouchID)~~ — Implemented via `expo-local-authentication`.
- [x] ~~Recurring Transactions~~ — Implemented as Planned Payments with full simulation integration.
- [x] ~~Budgeting Goals~~ — Implemented as Budgets with scoped account tracking.
- [x] ~~CSV Import~~ — Implemented via plugin system (Ivy Wallet, Cashew, native JSON).
- [x] ~~Date Range Filters~~ — Implemented via `useDateRangeFilter` hook.
- [x] ~~Reports Drill-down~~ — Implemented with three sections (Overview, Spending, Wealth) and interactive charts.
- [x] ~~Account Deletion Guards~~ — Implemented with linked transaction warnings.
