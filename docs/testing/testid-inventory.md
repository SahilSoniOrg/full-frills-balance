# Stable testID inventory (Phase 0)

**Canonical registry for Detox:** `e2e/screens/index.ts` (import in specs via `e2e/actions/**`, not raw `by.id` in specs).

**Policy:** IDs listed here are part of the mobile E2E contract. Renaming or removing one requires updating `e2e/screens/index.ts`, affected actions/flows, and this doc in the same PR.

| Status | Meaning |
| ------ | ------- |
| ✅ | Literal `testID` in app code |
| 🔗 | Derived at runtime from a parent `testID` (documented pattern) |

---

## Onboarding

| testID | Screen constant | Source |
| ------ | --------------- | ------ |
| `onboarding-screen` | `onboarding.screen` | `OnboardingView.tsx` |
| `onboarding-name-input` | `onboarding.nameInput` | `StepSplash.tsx` |
| `onboarding-continue-button` | `onboarding.continueButton` | `StepSplash.tsx` |
| `selectable-grid-continue-button` | `onboarding.gridContinue` | `SelectableGrid.tsx` |
| `onboarding-theme-continue-button` | `onboarding.themeContinue` | `OnboardingThemeStep.tsx` |
| `onboarding-finish-button` | `onboarding.finishButton` | `StepFinalize.tsx` |

Grid tiles use `grid-item-{id}` (`SelectableGrid.tsx`); not centralized in `e2e/screens` yet.

---

## Bottom tabs

| testID | Screen constant | Source |
| ------ | --------------- | ------ |
| `tab-dashboard` | `dashboard.tab` | `TabsLayout.tsx` (`tabBarButtonTestID`) |
| `tab-accounts` | `tabs.accounts` | `TabsLayout.tsx` |
| `tab-commitments` | `tabs.commitments` | `TabsLayout.tsx` |
| `tab-activity` | `tabs.activity` | `TabsLayout.tsx` |
| `tab-settings` | `tabs.settings` | `TabsLayout.tsx` |

---

## Dashboard

| testID | Screen constant | Source |
| ------ | --------------- | ------ |
| `dashboard-screen` | `dashboard.screen` | `DashboardScreenView.tsx` |

---

## Journal (entry)

| testID | Screen constant | Source |
| ------ | --------------- | ------ |
| `amount-input` | `journal.amountInput` | `SimpleFormAmountInput.tsx` |
| `journal-description-input` | — (flows only today) | `JournalMetaCard.tsx` |
| `submit-footer-button` | `journal.submitFooter` | `SubmitFooter.tsx` |

---

## Accounts

| testID | Screen constant | Source |
| ------ | --------------- | ------ |
| `fab-button` | `accounts.fab` | `FloatingActionButton.tsx` |
| `tab-item-accounts` | `accounts.tabAccounts` | 🔗 `AppTabs` default: `tab-item-{option.id}` (`AccountsListView.tsx`) |
| `tab-item-categories` | — | 🔗 same pattern (`AccountsListView.tsx`) |
| `hero-name-input` | shared with planned payments | `FormHeroSection.tsx` |
| `submit-footer-button` | `accounts.submitFooter` | `SubmitFooter.tsx` |

---

## Commitments (budgets + planned)

| testID | Screen constant | Source |
| ------ | --------------- | ------ |
| `commitments-tabs` | `commitments.tabs` | `CommitmentsScreen.tsx` |
| `commitments-tabs-item-budgets` | — | 🔗 `AppTabs`: `{testID}-item-{option.id}` |
| `commitments-tabs-item-planned` | — | 🔗 same (`CommitmentsScreen.tsx`) |
| `budget-interval-type` | — | `BudgetEditScreen.tsx` (segmented control root) |
| `budget-interval-type-item-DAILY` | `budgets.intervalItem('DAILY')` | 🔗 `AppSegmentedControl` (`BudgetEditScreen.tsx`) |
| `budget-interval-type-item-WEEKLY` | `budgets.intervalItem('WEEKLY')` | 🔗 same |
| `budget-interval-type-item-MONTHLY` | `budgets.intervalItem('MONTHLY')` | 🔗 same |
| `budget-interval-type-item-YEARLY` | `budgets.intervalItem('YEARLY')` | 🔗 same |

---

## Planned payments (form)

| testID | Screen constant | Source |
| ------ | --------------- | ------ |
| `hero-name-input` | `plannedPayments.heroName` | `FormHeroSection.tsx` |
| `hero-amount-input` | `plannedPayments.heroAmount` | `FormHeroSection.tsx` |
| `submit-footer-button` | `plannedPayments.submitFooter` | `SubmitFooter.tsx` |

---

## Derived ID patterns (do not duplicate literals)

| Component | Pattern |
| --------- | ------- |
| `AppTabs` | `{testID}-item-{option.id}` or `tab-item-{option.id}` if `testID` omitted |
| `AppSegmentedControl` | `{testID}-item-{option.id}` |
| `SelectableGrid` | `grid-item-{id}` |
