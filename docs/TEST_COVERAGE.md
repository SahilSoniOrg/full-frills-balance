# Test Coverage Mapping

## How to Run Tests
1.  Ensure local dev server is running: `npm run web`
2.  Run Playwright: `npx playwright test`
    *   *Note*: Requires `npx playwright install` if first run.

## Journey Coverage

| User Journey | Playwright Test File | Status |
| :--- | :--- | :--- |
| User Journey | Playwright Test File | Status |
| :--- | :--- | :--- |
| **J1: Onboarding** | `e2e/onboarding.test.ts` | ✅ Verified |
| **J2: Core Usage** | `e2e/core-journey.test.ts` | ✅ Verified |
| **J3: Editing & History** | `e2e/editing.test.ts` | ✅ Verified |
| **J4: Transfers** | `e2e/transfers.test.ts` | ✅ Verified |
| **J5: Multi-Currency** | `e2e/multi-currency.test.ts` | ✅ Verified |
| **J6: Privacy/Settings** | `e2e/settings-visuals.test.ts` | ✅ Verified |
| **J7: Persistence** | `e2e/persistence.test.ts` | ✅ Verified |
| **J8: Complex Journaling** | `e2e/complex-journal.test.ts` | ✅ 20+ Cases |
| **J9: Account Lifecycle** | `e2e/account-types.test.ts` | ✅ 10+ Cases |
| **J10: Visual Robustness** | `e2e/visual-regressions.test.ts` | ✅ 10+ Cases |
| **J11: Stress & Integrity** | `e2e/stress-boundary.test.ts` | ✅ 10+ Cases |
| **J12: Edge Case Library** | `e2e/misc-edge-cases.test.ts` | ✅ 5+ Cases |
| **J13: Massive Variation** | `e2e/massive-coverage.test.ts` | ✅ 23+ Cases |

## Feature Coverage

| Feature | Test Scenarios |
| :--- | :--- |
| **Accounts** | Create, Read List, Edit Name, Delete Warning. |
| **Journal** | Create Expense, Income, Transfer. Verify Balance Update. Edit Tx. |
| **Settings** | Toggle Theme, Privacy Mode. Reset App. |
| **Persistence** | Reload app and verify data remains. |
| **Multi-Currency** | Create non-default currency account and transaction. |
