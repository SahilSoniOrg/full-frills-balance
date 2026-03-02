# Full Codebase Audit Report

## Skill Usage
Used `frontend-design` for UI architecture and design-system consistency checks, plus code-review rigor for correctness and maintainability.

## 1) Audit Scope Inventory (Start of Audit)

### App Routes (Expo Router)
- `(tabs)`: dashboard, accounts, commitments, activity, settings
- Stack routes: onboarding, journal-entry, account-creation, account-details, transaction-details, account-reorder, manage-hierarchy, reports, insights, insight-details, planned-payments, planned-payment-form, planned-payment-details, sms-rules, sms-rule-form, import-selection, appearance-settings, budget-details, budget-edit, audit-log, modal, design-preview

### Feature Modules
- `app` shell/bootstrap
- `dashboard` + `insights`
- `journal` + `journal entry`
- `accounts` + hierarchy + reorder
- `reports`
- `settings` + import + SMS rules + appearance
- `planned-payments`
- `budget`
- `audit`
- `onboarding`
- `commitments`
- `dev`

### Shared UI Layers
- `src/components/core`
- `src/components/layout`
- `src/components/common`
- `src/components/charts`

### Supporting Layers (reviewed for cross-layer impact)
- `src/contexts` (UI state/theming)
- `src/hooks`
- `src/services`
- `src/data` repositories/models/database
- `src/utils`

### Verification Passes
- Full repository file inventory (`rg --files`)
- Per-feature file inspection (screens, components, hooks)
- Shared component and design-system inspection
- Lint verification (`npm run lint`)

---

## 2) Findings (Ordered by Severity)

### FINDING 1
A. Files involved
- `src/features/onboarding/components/OnboardingSelectableStep.tsx`

B. What is wrong and why it increases entropy
- A hook (`React.useMemo`) is called inside a conditional branch, violating Rules of Hooks and causing unstable runtime behavior risk.

C. Action type
- `SPLIT`

D. Proposed structure
- Split into dedicated step components:
  - `CurrencyStepContent.tsx`
  - `AccountsStepContent.tsx`
  - `CategoriesStepContent.tsx`
  - `ArchetypeStepContent.tsx`
- Keep `OnboardingSelectableStep.tsx` as a thin dispatcher.

E. Minimal before/after sketch
- Before: One component with branch-local hooks.
- After: Dispatcher + one hook-safe component per branch.

---

### FINDING 2
A. Files involved
- `src/hooks/use-theme.ts`

B. What is wrong and why it increases entropy
- `themePreference === 'system'` forces `dark` instead of using resolved system mode, creating global theme mismatch and hidden UI bugs.

C. Action type
- `MERGE`

D. Proposed structure
- Merge theme-mode resolution with `UIContext.themeMode` as single source of truth.

E. Minimal before/after sketch
- Before: `themeMode = (system ? 'dark' : preference)`.
- After: `themeMode = themeOverride ?? ui.themeMode`.

---

### FINDING 3
A. Files involved
- `src/utils/alerts.ts`

B. What is wrong and why it increases entropy
- `ConfirmOptions` is declared/exported twice, producing module export errors and type ambiguity.

C. Action type
- `DELETE`

D. Proposed structure
- Keep exactly one `ConfirmOptions` declaration near confirm API.

E. Minimal before/after sketch
- Before: duplicate interface blocks.
- After: one interface + one export path.

---

### FINDING 4
A. Files involved
- `src/features/reports/hooks/useReportsViewModel.ts`
- `src/features/reports/components/ReportsView.tsx`

B. What is wrong and why it increases entropy
- Pull-to-refresh is enabled in UI but `onRefresh` is a no-op, creating a misleading interaction and maintainability confusion.

C. Action type
- `INLINE INTO CALLER`

D. Proposed structure
- Either remove `RefreshControl` in `ReportsView`, or wire `onRefresh` to real data refresh.

E. Minimal before/after sketch
- Before: interactive refresh + empty callback.
- After: no refresh control OR real refresh implementation.

---

### FINDING 5
A. Files involved
- `src/components/common/IconPickerModal.tsx`
- `src/features/onboarding/components/IconPickerModal.tsx`

B. What is wrong and why it increases entropy
- Two similar icon picker modals diverge in icon sets, layout, and behaviors, causing duplicated maintenance and inconsistent UX.

C. Action type
- `MERGE`

D. Proposed structure
- Single shared `IconPickerModal` in `src/components/common` with config props (`icons`, title, columns).

E. Minimal before/after sketch
- Before: onboarding-specific + common duplicate implementations.
- After: one configurable modal reused by onboarding/accounts.

---

### FINDING 6
A. Files involved
- `src/features/settings/components/CurrencyPreference.tsx`
- `src/features/accounts/components/CurrencySelector.tsx`

B. What is wrong and why it increases entropy
- Duplicated currency selection modal logic, filtering logic, and list rendering with slight style drift.

C. Action type
- `MERGE`

D. Proposed structure
- Extract one `CurrencyPickerSheet` component in `src/components/common` and reuse everywhere.

E. Minimal before/after sketch
- Before: each feature keeps modal/filter/list state.
- After: both call a shared sheet + callback.

---

### FINDING 7
A. Files involved
- `src/features/accounts/components/AccountDetailsView.tsx`
- `src/features/journal/components/TransactionDetailsView.tsx`
- `src/features/planned-payments/components/PlannedPaymentDetailsView.tsx`

B. What is wrong and why it increases entropy
- Repeated inline header action composition with near-identical IconButton groups.

C. Action type
- `EXTRACT HOOK`

D. Proposed structure
- Extract `useHeaderActions(actionsConfig)` + small `HeaderActionsRow` component.

E. Minimal before/after sketch
- Before: each screen constructs JSX inline.
- After: screens pass config arrays.

---

### FINDING 8
A. Files involved
- `src/features/journal/hooks/useTransactionDetailsViewModel.ts`
- `src/features/accounts/hooks/useAccountReorderViewModel.ts`
- `src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel.ts`

B. What is wrong and why it increases entropy
- ViewModels expose `theme`; presentation concerns leak into orchestration layer and widen VM interfaces.

C. Action type
- `EXTRACT HOOK`

D. Proposed structure
- Remove theme from VM outputs. Consume `useTheme()` directly in views.

E. Minimal before/after sketch
- Before: `vm.theme` drives style at view.
- After: `const { theme } = useTheme()` inside view.

---

### FINDING 9
A. Files involved
- `src/features/journal/components/SmsImportSheet.tsx`

B. What is wrong and why it increases entropy
- One component mixes parsing/orchestration/navigation/mutation with raw `Text`, hardcoded light colors, and many inline style rules. It bypasses the design system and is hard to test.

C. Action type
- `SPLIT`

D. Proposed structure
- `useSmsImportSheetViewModel` (data/load/match/actions)
- `SmsImportSheetView` (pure rendering with core components)
- Replace hardcoded `Colors.light`/`Text` with `useTheme` + `AppText`.

E. Minimal before/after sketch
- Before: all logic and UI in one file.
- After: hook + presentational view.

---

### FINDING 10
A. Files involved
- `src/features/reports/components/ReportsView.tsx`
- `src/components/common/DateRangeFilter.tsx`

B. What is wrong and why it increases entropy
- Reports builds a custom date filter chip instead of reusing `DateRangeFilter`, duplicating behavior and styling.

C. Action type
- `MERGE`

D. Proposed structure
- Use `DateRangeFilter` with `showNavigationArrows={false}` in reports.

E. Minimal before/after sketch
- Before: hand-made Touchable chip.
- After: `<DateRangeFilter ... />`.

---

### FINDING 11
A. Files involved
- `src/features/budget/screens/BudgetEditScreen.tsx`
- `src/components/layout/ScreenHeader.tsx`
- `src/components/layout/Screen.tsx`

B. What is wrong and why it increases entropy
- Budget edit uses `ScreenHeader` directly while most screens rely on `Screen`+`NavigationBar`, causing a parallel header path used in one flow.

C. Action type
- `INLINE INTO CALLER`

D. Proposed structure
- Inline this header behavior into `Screen` props for budget edit and remove `ScreenHeader` usage.

E. Minimal before/after sketch
- Before: `<Screen><ScreenHeader .../></Screen>`.
- After: `<Screen title=... headerActions=...>`.

---

### FINDING 12
A. Files involved
- `src/features/accounts/components/AccountTypeSelector.tsx`
- `src/features/accounts/components/AccountSubcategorySelector.tsx`

B. What is wrong and why it increases entropy
- Same selectable-chip rendering pattern is duplicated, differing mostly in data source.

C. Action type
- `MERGE`

D. Proposed structure
- Extract `SelectionChips<T>` component (label/value, disabled, selected styling) and reuse.

E. Minimal before/after sketch
- Before: two near-identical map/render blocks.
- After: shared chips component with typed options.

---

### FINDING 13
A. Files involved
- `src/components/common/TypedFlashList.tsx`
- `src/components/common/TransactionListView.tsx`
- `src/features/journal/components/JournalListView.tsx`

B. What is wrong and why it increases entropy
- `forwardRef` components missing `displayName` generate lint errors and reduce debug quality.

C. Action type
- `INLINE INTO CALLER`

D. Proposed structure
- Set explicit `displayName` for each forwarded component.

E. Minimal before/after sketch
- Before: anonymous forwardRef.
- After: `Component.displayName = '...'`.

---

## 3) Reusable Component Opportunities (Primary Focus)

1. `IconPickerModal` unification (`MERGE`)
2. `CurrencyPickerSheet` shared selector (`MERGE`)
3. `SelectionChips` for account/category type chips (`MERGE`)
4. `HeaderActionsRow` + config hook (`EXTRACT HOOK`)
5. `DetailHeroCard` pattern for transaction/account/planned detail headers (`MERGE`)
6. `SmsImportSheetViewModel + View` split (`SPLIT`)
7. `DateFilterBar` standardization through `DateRangeFilter` (`MERGE`)
8. Consistent loading/empty application with `LoadingView`/`EmptyStateView` (`MERGE`)

---

## 4) Lint-Based Cross-Check (Missed-Item Sweep)

`npm run lint` produced 27 issues (7 errors, 20 warnings). High-value issues aligned with the audit:
- Hook rule violation in onboarding step component
- Duplicate export in alerts
- Missing display names on forwarded list components
- UI string escape issue in insights
- Multiple hook dependency warnings in budget/journal/chart flows

This lint sweep was used as the final "missed something" check.

---

## 5) Reviewed Items Checklist (End of Audit)

### Fully audited
- App shell, routing wrappers, tab layout, bootstrap
- All feature modules under `src/features/*` (screens + major components + key hooks)
- Shared UI libraries (`core`, `layout`, `common`, `charts`)
- Theme/context and global hook interactions
- Cross-cutting utilities impacting frontend architecture (`alerts`, navigation usage)
- Design-system docs/tokens consistency

### Partially audited (depth-limited, but included in codebase scan)
- Native platform folders (`android/`, `ios/`, module bridges)
- Service/repository internals not directly tied to frontend composition

### Final status
- No frontend feature area left unaudited.
- No remaining unaudited route-level screen.
- Final lint sweep completed to catch misses.
