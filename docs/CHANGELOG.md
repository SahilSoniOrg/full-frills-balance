# Changelog

All notable changes to this project are documented here. Versions correspond to EAS build tags (`abv_NNNNN`).

---

## [Unreleased] — post abv_00079

### Changed
- **README & Documentation**: Comprehensive update to all project documentation.
- **Chart Gesture Hardening**: Improved Pan/Tap disambiguation on LineChart tooltips.

### Fixed
- Safe to Spend now includes today's transactions in the calculation.
- Color calculation regression after design system refactor.

---

## [abv_00079] — TypeScript 6 & Package Updates

### Changed
- Upgraded to TypeScript 6.x with strict mode.
- Updated Expo SDK and all dependency versions.
- React Native 0.83.4.

---

## [abv_00078] — Boot Performance

### Changed
- Optimized cold-boot pipeline with adaptive hybrid scheduling.
- Splash-to-app transition refinements to eliminate visual flicker.
- Startup instrumentation via TraceService for time-to-interactive monitoring.

---

## [abv_00077] — Skia Removal & Expo Update

### Changed
- Removed `react-native-skia` dependency — charts now use pure SVG rendering.
- Expo ecosystem update.

---

## [abv_00076] — Raw SQL Performance

### Changed
- Enabled raw SQL queries in `TransactionRawRepository` for Android.
- Optimized balance computation and period metrics to bypass the WatermelonDB bridge.

---

## [abv_00075] — Data Layer Optimization

### Changed
- Transaction mapping optimization with SQL-side counting.
- Batch query patterns to reduce bridge congestion.

---

## [abv_00074] — Overdue Payments & Audit

### Added
- Overdue indication on planned payments.
- Account/transaction restore from audit history.
- Account deletion friction dialog with linked transaction warnings.

### Fixed
- Planned payment past-due handling in simulation engine.

---

## [abv_00073] — UI Standardization

### Changed
- Standardized account, budget, and audit card components.
- Added GoldObsidian theme.
- Auto-focus in search.

---

## [abv_00072] — Safe to Spend Analytics

### Added
- Analytics tracking for Safe to Spend interactions.
- Environment flag for analytics toggling.

---

## [abv_00071] — Privacy & Safe to Spend UX

### Changed
- Improved privacy toggle behavior.
- Tappable items in Safe to Spend breakdown for drill-through navigation.
- Per-account Safe to Spend display.
- Source account linking for budgets.

---

## [abv_00070] — Simulation V2 & Credit Cards

### Added
- **Simulation V2**: Complete architectural rewrite of the cash flow simulation engine.
  - Three-generator architecture (PlannedFlow, BudgetFlow, LiabilityFlow).
  - FlowResolver for obligation deduplication.
  - Credit card statement cycle modeling.
  - Multi-currency normalization.
- Credit card minimum payment option.
- Pay-with-account linking for credit cards.

### Changed
- Deprecated and removed Simulation V1.
- Refactored Safe to Spend for maintainability.
- FlashList no longer requires estimated item size.

### Fixed
- Credit card payoff calculation in simulation.
- IntegrityService edge case with zero-transaction months.

---

## [1.0.0] — Initial Release

### Added
- Double-entry accounting core.
- Account management (Asset, Liability, Equity, Income, Expense).
- Journal entries with multi-line transaction support.
- Simple mode (income/expense/transfer) and advanced mode.
- Net worth dashboard with privacy toggle.
- Reports with income vs. expense trends and category breakdowns.
- WatermelonDB with offline-first architecture.
- IntegrityService for balance verification on startup.
- JSON export via share sheet.
- ErrorBoundary with fallback UI.
- Onboarding flow with name and currency selection.
- Theme support (System/Light/Dark).
- Structured logging with production stripping.
