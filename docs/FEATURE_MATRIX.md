# Feature Completeness Matrix

**Last reviewed:** 2026-07-27 (UI inventory; not re-tested end-to-end). For engineering truth on money, export, and invariants, use [PROJECT_BIBLE.md](../PROJECT_BIBLE.md).

| Feature | State | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Onboarding** | | | |
| User Name Input | Standard | ✅ Implemented | Persisted to MMKV preferences. |
| Currency Selection | Standard | ✅ Implemented | List populated from CurrencyRepository. |
| Archetype Selection | Standard | ✅ Implemented | Personalization via ArchetypePreference. |
| **Dashboard** | | | |
| Safe to Spend Card | Standard | ✅ Implemented | Headline feature. Full simulation-backed projection. |
| Safe to Spend Chart | Standard | ✅ Implemented | 30-day line chart with tap-and-scrub tooltips. |
| Safe to Spend Breakdown | Standard | ✅ Implemented | Stacked bar (safe / committed / debts). |
| Safe to Spend Explanation | Modal | ✅ Implemented | Interactive ledger with expandable sections. |
| Safe to Spend Legend | Modal | ✅ Implemented | Per-account contribution breakdown. |
| Net Worth Card | Standard | ✅ Implemented | Assets/Liabilities breakdown with privacy toggle. |
| Dashboard Summary | Standard | ✅ Implemented | Monthly income/expense summary card. |
| Transaction List | Standard | ✅ Implemented | FlashList with infinite scroll, date grouping. |
| Transaction List | Empty | ✅ Implemented | "No transactions yet" + CTA. |
| **Accounts** | | | |
| List View | Standard | ✅ Implemented | Grouped by type, hierarchical display. |
| Create Account | Standard | ✅ Implemented | Name, Type, Subtype, Currency, Color, Icon, Parent. |
| Edit Account | Standard | ✅ Implemented | Via Details screen. |
| Delete Account | Standard | ✅ Implemented | Friction dialog with linked transaction warning. |
| Account Reorder | Standard | ✅ Implemented | Drag-to-reorder via dedicated screen. |
| Account Hierarchy | Standard | ✅ Implemented | Parent/child relationships with manage screen. |
| Account Details | Standard | ✅ Implemented | Balance, transaction history, date range filter. |
| **Journal / Entry** | | | |
| Simple Mode | Expense | ✅ Implemented | |
| Simple Mode | Income | ✅ Implemented | |
| Simple Mode | Transfer | ✅ Implemented | Two accounts selection required. |
| Advanced Mode | Standard | ✅ Implemented | Multi-line support. Auto-triggers if >2 lines. |
| Edit Mode | Standard | ✅ Implemented | Shows "EDITING" banner. |
| Validation | Error | ✅ Implemented | Unbalanced, missing description, zero amounts. |
| Journal Search | Standard | ✅ Implemented | Text search with auto-focus. |
| Transaction Details | Standard | ✅ Implemented | Full details with edit/void actions. |
| Transaction Sharing | Standard | ✅ Implemented | Multi-format sharing (text, detailed, ledger). |
| Transaction Selection | Standard | ✅ Implemented | Multi-select mode on transaction cards. |
| **Planned Payments** | | | |
| List View | Standard | ✅ Implemented | Active planned payments with next occurrence. |
| Create/Edit | Standard | ✅ Implemented | Interval type, amount, frequency, accounts. |
| Details View | Standard | ✅ Implemented | History tracking, overdue indication. |
| Overdue Detection | Standard | ✅ Implemented | Visual indicator for past-due payments. |
| Simulation Integration | Standard | ✅ Implemented | Feeds PlannedFlowGenerator for Safe to Spend. |
| **Budgets** | | | |
| Create Budget | Standard | ✅ Implemented | Name, amount, currency, scoped accounts. |
| Budget List | Standard | ✅ Implemented | Progress bars, remaining amounts. |
| Budget Details | Standard | ✅ Implemented | Edit and scope management. |
| Simulation Integration | Standard | ✅ Implemented | Feeds BudgetFlowGenerator for Safe to Spend. |
| **Reports** | | | |
| Overview Section | Standard | ✅ Implemented | Income vs. expense with trend lines. |
| Spending Section | Standard | ✅ Implemented | Category breakdown with donut chart. |
| Wealth Section | Standard | ✅ Implemented | Net worth trend over time. |
| Report Filtering | Standard | ✅ Implemented | Date range picker, account filter. |
| Chart Interactions | Standard | ✅ Implemented | Tap-and-scrub with tooltips across all chart types. |
| **Charts** | | | |
| Line Chart | Standard | ✅ Implemented | Interactive with gesture handling. |
| Bar Chart | Standard | ✅ Implemented | Grouped and stacked variants. |
| Area Chart | Standard | ✅ Implemented | Filled trend visualization. |
| Donut Chart | Standard | ✅ Implemented | Category breakdown. |
| Heatmap Chart | Standard | ✅ Implemented | Activity density visualization. |
| Calendar Heatmap | Standard | ✅ Implemented | GitHub-style contribution grid. |
| Sankey Chart | Standard | ✅ Implemented | Flow visualization. |
| **SMS (Android)** | | | |
| SMS Inbox | Standard | ✅ Implemented | Bank SMS reader via native module. |
| SMS Rules | Standard | ✅ Implemented | Configurable auto-post rules. |
| Rule Form | Standard | ✅ Implemented | Pattern matching, account mapping. |
| **Hub** | | | |
| Hub Widget | Standard | ✅ Implemented | Centralized insight and action center. |
| Emergency Fund Popup | Standard | ✅ Implemented | Emergency fund tracking modal. |
| **Commitments** | | | |
| Commitments View | Standard | ✅ Implemented | Aggregated obligations and upcoming payments. |
| **Data Management** | | | |
| JSON Export | Standard | ✅ Implemented | Full data dump via share sheet. |
| Data Import | Standard | ✅ Implemented | Plugin-based: Native, Ivy Wallet, Cashew formats. |
| Data Reset | Standard | ✅ Implemented | "Danger Zone" with confirmation. |
| Import Selection | Standard | ✅ Implemented | File picker with format detection. |
| **Audit** | | | |
| Audit Log | Standard | ✅ Implemented | Immutable mutation log with before/after state. |
| Restore from Audit | Standard | ✅ Implemented | Transaction/account restoration from history. |
| **Settings** | | | |
| Theme Toggle | Standard | ✅ Implemented | System/Light/Dark + custom themes (GoldObsidian). |
| Appearance Settings | Standard | ✅ Implemented | Theme, display preferences. |
| Currency Preference | Standard | ✅ Implemented | Default currency selection. |
| Notification Preference | Standard | ✅ Implemented | Daily Safe to Spend notification toggle. |
| Share Format Preference | Standard | ✅ Implemented | Default sharing format selection. |
| Personalization Settings | Standard | ✅ Implemented | Archetype, preferences. |
| Privacy Mode | Standard | ✅ Implemented | "••••••" masking for all financial values. |
| Biometric Lock | Standard | ✅ Implemented | FaceID/TouchID via expo-local-authentication. |
| **Notifications** | | | |
| Daily Safe to Spend | Standard | ✅ Implemented | Scheduled notification with current S2S value. |
| Activity Reminder | Standard | ✅ Implemented | Nudge to record recent transactions. |
| **Insights** | | | |
| Proactive Insights | Standard | ✅ Implemented | InsightService generates contextual financial tips. |
| **Widgets (Android)** | | | |
| Journal Launcher Widget | Standard | ✅ Implemented | Home-screen quick entry via native Expo module. |
| **Multi-Currency** | | | |
| Per-account Currency | Standard | ✅ Implemented | Each account can have its own currency. |
| Exchange Rates | Standard | ✅ Implemented | Live rates from ExchangeRate-API with caching. |
| Cross-currency Reports | Standard | ✅ Implemented | Normalized to display currency for summaries. |

## Legend
*   ✅ **Implemented**: Code exists and appears functional.
*   ⚠️ **Partial**: UI exists but logic might be incomplete or untested.
*   ❌ **Missing**: Placeholder or non-existent.
