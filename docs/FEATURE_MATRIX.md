# Feature Completeness Matrix

| Feature | State | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Onboarding** | | | |
| User Name Input | Standard | ✅ Implemented | Persisted to prefs. |
| Currency Selection | Standard | ✅ Implemented | List populated from service. |
| **Dashboard** | | | |
| Net Worth Card | Loading | ✅ Implemented | Shows "..." loading state. |
| Net Worth Card | Loaded | ✅ Implemented | Breakdown of Assets/Liabilities. |
| Net Worth Card | Privacy | ✅ Implemented | "••••••" when toggled. |
| Transaction List | Empty | ✅ Implemented | "No transactions yet" + CTA. |
| Transaction List | Populated | ✅ Implemented | FlashList used. |
| **Accounts** | | | |
| List View | Empty | ✅ Implemented | |
| Create Account | Standard | ✅ Implemented | Name, Type, Currency. |
| Edit Account | Standard | ✅ Implemented | Via Details screen. |
| Delete Account | Standard | ⚠️ Partial | UI exists, need to verify strict checks (e.g. existing txs). |
| **Journal / Entry** | | | |
| Simple Mode | Expense | ✅ Implemented | |
| Simple Mode | Income | ✅ Implemented | |
| Simple Mode | Transfer | ✅ Implemented | Two accounts selection required. |
| Advanced Mode | Standard | ✅ Implemented | Multi-line support. Auto-triggers if >2 lines. |
| Edit Mode | Existing Tx | ✅ Implemented | Shows "EDITING" banner. |
| Validation | Error | ✅ Implemented | Unbalanced, Missing Description. |
| **Reports** | | | |
| Summary | Standard | ❌ Missing | Tab shows "Coming Soon". |
| **Settings** | | | |
| Theme Toggle | Standard | ✅ Implemented | System/Light/Dark. |
| Data Export | Standard | ✅ Implemented | JSON dump. |
| Data Reset | Standard | ✅ Implemented | "Danger Zone". |

## Legend
*   ✅ **Implemented**: Code exists and appears functional.
*   ⚠️ **Partial**: UI exists but logic might be incomplete or untested.
*   ❌ **Missing**: Placeholder or non-existent.
