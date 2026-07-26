# Test Coverage Mapping

## How to Run Tests

```bash
# Unit & integration tests (Jest)
npm test                     # All tests with coverage report

# End-to-end tests (Playwright, web export)
npm run test:e2e:build       # Build web export for E2E
npm run serve:e2e            # Serve locally on port 8081
npm run test:e2e             # Run Playwright suite
npm run test:e2e:ui          # Interactive Playwright UI
npm run test:e2e:debug       # Debug mode with inspector

# Visual component testing
npx expo start --dev-client  # Open /_design-preview for component gallery
```

## E2E Journey Coverage (Playwright)

| User Journey | Test File | Status |
| :--- | :--- | :--- |
| Onboarding flow | `e2e/onboarding.test.ts` | ✅ Active |
| Accounts flow | `e2e/accounts.test.ts` | ✅ Active |
| Transactions / journal flow | `e2e/transactions.test.ts` | ✅ Active |
| Settings flow | `e2e/settings.test.ts` | ✅ Active |
| Reports flow | `e2e/reports.test.ts` | ✅ Active |
| Multi-currency flow | `e2e/multi-currency.test.ts` | ✅ Active |

## Unit & Integration Test Coverage

### Services

| Service | Test Location | Coverage Notes |
| :--- | :--- | :--- |
| CashFlowSimulationService | `src/services/simulation/__tests__/` | **Heavy coverage** — unit, scenario, heavy load, liability-specific, and NaN-safety tests |
| SafeToSpendReadModel | `src/services/simulation/__tests__/` | Safe to Spend projection, cache, headline; simulation engine scenarios |
| NotificationService | `src/services/notification/__tests__/` | OS notification scheduling and reminder permissions (not Safe to Spend) |
| ExchangeRateService | `src/services/__tests__/exchange-rate-service.test.ts` | Rate fetching, caching, fallback behavior |
| InsightService | `src/services/insight/__tests__/` | Financial insight generation |
| BudgetReadService | `src/services/budget/` | Budget usage computation |
| Import Plugins | `src/services/import/plugins/` | Ivy Wallet and native import parsing |
| Import Plugin Registry | `src/services/import/ImportPluginRegistry.test.ts` | Plugin registration and dispatch |

### Simulation Engine (Deep Coverage)

| Test File | Focus |
| :--- | :--- |
| `CashFlowSimulationService.test.ts` | Core scenarios: no obligations, planned outflows, budget burns, income timing |
| `CashFlowSimulationService.scenarios.test.ts` | Complex multi-account, multi-obligation scenarios |
| `CashFlowSimulationService.heavy.test.ts` | Stress tests: many accounts, many flows, edge thresholds |
| `CashFlowSimulationService.liabilities-heavy.test.ts` | Credit card cycles, statement dates, settlement tracking |
| `LiabilityFlowIssue.test.ts` | Regression test for liability flow edge cases |
| `CheckNaN.test.ts` | NaN safety in simulation results |

### Hooks

| Hook | Test Location |
| :--- | :--- |
| `useDateRangeFilter` | `src/hooks/__tests__/useDateRangeFilter.test.ts` |
| `useJournalListViewModel` | `src/features/journal/hooks/__tests__/useJournalListViewModel.test.ts` |

### Data Layer

| Area | Test Location | Coverage Notes |
| :--- | :--- | :--- |
| Repositories | `src/data/repositories/__tests__/` | CRUD, query, and edge case coverage |
| SafeToSpendMapper | `src/features/dashboard/mappers/__tests__/` | ViewModel mapping from simulation results |

### Utilities

| Utility | Test Location |
| :--- | :--- |
| Currency Formatting | `src/utils/currencyFormatter.test.ts` |
| Money Arithmetic | `src/utils/money.test.ts` |
| Design System (Box) | `src/design-system/__tests__/` |
| Settings Components | `src/features/settings/components/CurrencyPreference.test.tsx` |

## Coverage Gaps

- **UI Components**: Most feature-level UI components rely on visual testing via `/_design-preview` rather than automated tests.
- **Hub & Commitments**: Newer features lack dedicated unit tests.
- **SmsService**: Complex parsing logic has limited automated coverage.
- **SharingService**: Multi-format output tested manually, no automated assertions.

## Notes
- Coverage report is generated automatically on `npm test` (Jest `--collectCoverage`).
- Simulation engine tests are the most critical — they validate the Safe to Spend core invariant.
- Keep this file updated when adding new test suites.
