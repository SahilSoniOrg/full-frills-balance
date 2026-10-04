# Full-Frills Balance: Consolidated Architecture, Flow & Component Audit

**Date:** October 4, 2026  
**Auditor:** Antigravity (Synthesizing internal flow audit, external Codex review, and design-system adoption audit)  
**Repository:** [full-frills-balance](file:///Users/sahilsoni/me/projects/full-frills-balance)  
**Baseline Status:** 460 test suites / 2,853 tests passing · 0 lint errors  
**Active Constraints:**
- **Reports V1 is preserved in place** (do NOT delete or retire V1; keep it functional for existing flows).
- Strict 1-concern-per-step execution with test verification before deletions.

---

## Executive Summary

This document serves as the single authoritative reference for all architectural findings, correctness defects, duplicate component clusters, and step-by-step suggestions for the codebase.

The repository's import boundaries and architectural barriers are structurally sound. All four major findings from the 2026-08-24 audit landed and remain verified:
- **F-01 (Journal ↔ Accounts cycle):** Fixed via [src/components/account-selection/index.ts](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/account-selection/index.ts).
- **F-02 (Constants depending on UI):** Fixed; domain icons isolated in [src/types/domainIcons.ts](file:///Users/sahilsoni/me/projects/full-frills-balance/src/types/domainIcons.ts).
- **F-03 (Domain types umbrella):** Split into modular types (`domainJournal.ts`, `domainTransaction.ts`, etc.).
- **F-04 (Reactive cache fragmentation):** Centralized via `ReactiveCacheCoordinator`.

**The Remaining Challenge:**
While import boundaries are strictly guarded by 11 ratchet scripts, **internal component and query implementations have drifted**. The same concern has been built multiple times in slightly different shapes. Crucially, this audit identifies two silent wrong-number defects, multiple shadow-named components, and uncovers a concrete path to eliminate duplication safely.

---

## 1. Phase 0: Correctness & Parity Defects (Immediate Priority)

Before consolidating components or refactoring UI flows, these functional bugs and data parity gaps must be resolved.

### 0.1 Heatmap Day Index Off-By-One (P0 — Silent Calculation Defect)
* **Location:**
  - Data calculation: [`src/services/reports/heatmapCalculators.ts:32`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/services/reports/heatmapCalculators.ts#L32)
  - Visual rendering: [`src/components/charts/HeatmapChart.tsx:53`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/charts/HeatmapChart.tsx#L53)
* **Evidence:**
  ```ts
  // heatmapCalculators.ts:32
  const key = `${dt.day()}_${dt.hour()}`; 
  // dayjs .day() returns 0 = Sunday .. 6 = Saturday

  // HeatmapChart.tsx:53
  const DAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // Index 0 = Monday
  ```
* **Impact:** Index 0 receives Sunday's spending but is labeled "M" (Monday). Every day column is shifted by one day across the spending report.
* **Suggestion:** Normalize [`heatmapCalculators.ts`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/services/reports/heatmapCalculators.ts#L32) to emit a Monday-first index: `((dt.day() + 6) % 7)` so `0 = Monday .. 6 = Sunday`. Add a unit test asserting Monday-through-Sunday bucket mapping.

---

### 0.2 Latest-Balance Tie-Breaker Parity: SQL vs. ORM (P1)
* **Location:** [`src/data/repositories/raw/TransactionRawMetricsQueries.ts`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/data/repositories/raw/TransactionRawMetricsQueries.ts)
* **Evidence:**
  - Native SQLite path ([lines 143–146](file:///Users/sahilsoni/me/projects/full-frills-balance/src/data/repositories/raw/TransactionRawMetricsQueries.ts#L143-L146)):
    ```sql
    ROW_NUMBER() OVER (PARTITION BY t.account_id
      ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC)
    ```
  - ORM fallback path ([lines 190–192](file:///Users/sahilsoni/me/projects/full-frills-balance/src/data/repositories/raw/TransactionRawMetricsQueries.ts#L190-L192)):
    ```ts
    Q.sortBy('transaction_date', Q.desc),
    Q.sortBy('created_at', Q.desc),
    // Missing tie-breaker: t.id DESC
    ```
* **Impact:** When two transactions share the exact same `transaction_date` and `created_at`, the native SQL engine deterministically picks the highest ID, while the ORM engine returns an arbitrary row. The same account computes different balances depending on adapter availability.
* **Suggestion:** Add `Q.sortBy('id', Q.desc)` to the ORM fallback query. Write an adapter-parity unit test asserting identical row ranking across both paths.

---

### 0.3 Amount Negative-Sign Coercion on Paste (P1)
* **Location:** [`src/services/journal/simpleJournalHelpers.ts:12`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/services/journal/simpleJournalHelpers.ts#L12)
* **Evidence:**
  ```ts
  export function parseSimpleAmountInput(amount: string): number {
    return parseFloat(amount.replace(/[^0-9.]/g, '')) || 0;
  }
  ```
* **Impact:** While input guards in [`SimpleFormAmountInput.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/journal/entry/components/SimpleFormAmountInput.tsx#L71) prevent typed garbage and submission validations reject zero, pasting `-50` into an unsanitized path strips `-` and coerces the amount to `+50`.
* **Suggestion:** Update input boundaries to reject or visually flag negative signs, independently validate positive amount requirements at the transaction posting boundary, and preserve empty draft `0` for projection arithmetic.

---

### 0.4 Currency Precision Normalization & Fallback Policy (P2)
* **Location:** [`src/utils/currencyFormatter.ts`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/utils/currencyFormatter.ts) vs [`src/hooks/use-currencies.ts`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/hooks/use-currencies.ts#L31)
* **Finding:** Currency codes with whitespace padding (e.g. `" USD "`) resolve differently across helper functions. While `currencyFormatter.test.ts` has strong tests, the fallback policy when a currency is missing from the database needs unification.
* **Suggestion:** Normalize codes (`code.trim().toUpperCase()`) prior to lookup. Keep the DB-backed precision layer intact; unify fallback policies into a single helper.

---

### 0.5 First-Account Creation Return Navigation (P2)
* **Location:** [`src/features/accounts/hooks/useAccountPersistence.ts:118-122`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/accounts/hooks/useAccountPersistence.ts#L118-L122)
* **Finding:** When a user creates their first account from the composer, they are routed to the Accounts tab rather than returned to their transaction draft.
* **Suggestion:** Check for a valid hand-back target (`accountCreationReturn.ts`). If one exists, pop back to the origin composer regardless of whether it was the user's first account.

---

## 2. Refactoring Guardrails (Pitfalls & Refuted Claims to Avoid)

Independent verification refuted several initial refactoring ideas. **Do NOT execute the following:**

| Proposed Action | Why It Must NOT Be Done |
|---|---|
| **Delete one Heatmap** | **Harmful:** [`heatmapCalculators.ts:32`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/services/reports/heatmapCalculators.ts#L32) calculates *weekday × hour* (hourly spending habits), while line 64 calculates *weekday × week* (calendar heatmap). [`ReportSpendingSection.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/reports/sections/ReportSpendingSection.tsx) requires both. |
| **Delete `AppSurface` in favor of `AppCard`** | **Layout Regression:** [`AppCard`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/ui/AppCard.tsx) enforces `paddingSize="md"` (translating to `lg` padding) and `overflow="hidden"`. [`AppSurface`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/ui/AppSurface.tsx) accepts raw Box padding and does not clip overflow. Replacing it breaks 13 screens. |
| **Remove Reports V1** | **User Constraint:** Reports V1 is required in place. Retain [`src/features/reports/`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/reports) and [app/reports.tsx](file:///Users/sahilsoni/me/projects/full-frills-balance/app/reports.tsx) intact. |
| **Bulk Replace `View` with `Box`** | **High Churn / Low ROI:** 136 feature files import `View`. Bulk regex migration causes layout and typing breakage. Migrate high-traffic components incrementally. |
| **Remove Workplace Check in Deep Links** | **Unverified:** `fullfrillsbalance://journal-entry` parses `journal-entry` as the hostname in Expo Linking; the workplace gate is not currently blocking widget taps. Reproduce on a physical device before modifying. |

---

## 3. Phase 1: Component Duplication & Consolidation Findings

### A. Settings Menu Path Shadowing (High Value)
* **Files:**
  - Common: [`src/components/settings/SettingsMenuItem.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/settings/SettingsMenuItem.tsx) & [`SettingsMenu.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/settings/SettingsMenu.tsx)
  - Feature: [`src/features/settings/components/SettingsMenuItem.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/settings/components/SettingsMenuItem.tsx) & [`SettingsMenu.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/settings/components/SettingsMenu.tsx)
* **Problem:** 38 call sites import the feature wrapper; 4 import the common component. The feature `SettingsMenu` hardcodes `variant='flat'`, silently overriding the common default `variant='surface'`. Identical names create accidental imports.
* **Suggestion:**
  1. Rename [`src/features/settings/components/SettingsMenuItem.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/settings/components/SettingsMenuItem.tsx) to `SettingsSearchMenuItem.tsx`.
  2. Rename [`src/features/settings/components/SettingsMenu.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/settings/components/SettingsMenu.tsx) to `SettingsMenuSection.tsx`.
  3. Add unit tests for the search wrapper.

---

### B. Safe Primitive Collapses & Migrations
1. **Collapse `Inline` → `Stack`:**
   - [`src/design-system/Inline.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/design-system/Inline.tsx) and [`src/design-system/Stack.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/design-system/Stack.tsx) are duplicate 46-line files with `direction` defaulted (`row` vs `column`).
   - Merge `Inline` into `Stack` (exporting `Row = (props) => <Stack direction="row" {...props} />`).
2. **Delete `Inset`:**
   - [`src/design-system/Inset.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/design-system/Inset.tsx) is a pure padding wrapper over [`Box`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/design-system/Box.tsx).
   - Migrate its 13 call sites to use `<Box padding="...">` and delete `Inset.tsx`.
3. **Migrate 23 Manual Divider Rules to `Separator`:**
   - Replace hand-rolled `{ height: 1, backgroundColor: theme.divider }` styles with [`src/design-system/Separator.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/design-system/Separator.tsx).

---

### C. Primitive Extractions Across Clusters
* **Notice & Banner Components:**
  - 4 divergent banners: `EntryInlineError`, `EntryEditBanner`, `IncompleteFxWarning`, `ReportsV2StatusNotice`.
  - Extract a single `NoticeBanner` with `tone="info" | "warning" | "error" | "neutral"`.
* **Progress Bars:**
  - `ProgressBar` (static 0–1, unstyled, 1 call site, no tests) vs `BudgetProgressBar` (animated 0–100, privacy masking, overspend stripes).
  - Absorb `ProgressBar` into [`BudgetProgressBar`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/budget/BudgetProgressBar.tsx).
* **Picker Sheets:**
  - `SelectionPickerSheet` (gated search, tested) vs `CurrencyPickerSheet` (manual list, no tests).
  - Migrate `CurrencyPickerSheet` to wrap `SelectionPickerSheet`.
* **Motion Wrappers:**
  - `FadeIn` exists with 7 call sites. Duplicate fade-in animations are inlined in `welcome.tsx` and `conversationUi.tsx`.
  - Migrate callers to use canonical `FadeIn`.

---

### D. Five Divergent Bottom Sheet & Modal Implementations
* **Files:**
  - [`ModalSurface.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/overlays/ModalSurface.tsx) (canonical)
  - [`BaseAccountPickerModal.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/account-selection/BaseAccountPickerModal.tsx)
  - [`DateRangePickerView.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/filters/DateRangePickerView.tsx)
  - [`DateTimePickerModal.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/filters/DateTimePickerModal.tsx)
  - [`SubAccountListModal.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/accounts/components/SubAccountListModal.tsx)
* **Problem:** `SubAccountListModal` manually allocates `Animated.Value(SCREEN_HEIGHT)` and spring listeners. `BaseAccountPickerModal` uses raw React Native `<Modal>`. Nested modal collisions require fragile `visible={visible && !nestedPickerVisible}` flags.
* **Suggestion:** Adopt `ModalSurface(position="bottomSheet")` as the single canonical sheet container across all pickers.

---

### E. Hero Amount & Form Footer Unification
* **Files:**
  - [`CalculatorAmountInput.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/forms/CalculatorAmountInput.tsx) vs [`SimpleFormAmountInput.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/journal/entry/components/SimpleFormAmountInput.tsx)
  - [`SubmitFooter.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/forms/SubmitFooter.tsx) vs [`JournalEntrySubmitBar.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/journal/entry/components/JournalEntrySubmitBar.tsx)
* **Suggestion:** Enhance `CalculatorAmountInput` to support currency prefix and clear button options. Retain `SimpleFormAmountInput` as a light wrapper delegating to it. Add `requirementHint` and `pulseOnSave` to `SubmitFooter`.

---

## 4. Phase 2: App Navigation & Flow Hardening

### A. Consolidate Seven Divergent Route Registries into `routeManifest.ts`
* **Current Fragmentation:**
  1. [`src/features/app/components/AppNavigation.tsx:44-86`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/app/components/AppNavigation.tsx#L44-L86) (stack definitions)
  2. [`src/utils/useTelemetry.ts:43-157`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/utils/useTelemetry.ts#L43-L157) (screen metadata)
  3. [`src/services/observability/observabilityPrivacy.ts:383-428`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/services/observability/observabilityPrivacy.ts#L383-L428) (privacy allow-list)
  4. [`src/navigation/setupRouting.ts`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/navigation/setupRouting.ts) (first-run gates)
  5. `AppNavigation` navigation action methods
  6. [`app/(tabs)/_layout.tsx:32-98`](file:///Users/sahilsoni/me/projects/full-frills-balance/app/(tabs)/_layout.tsx#L32-L98) (tab options)
  7. [`src/features/app/screens/RootIndexScreen.tsx:38`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/app/screens/RootIndexScreen.tsx#L38) (deep linking)
* **Observed Drift:**
  - `sms-settings` is missing from `SAFE_SCREEN_SEGMENTS` and silently redacts to `'other'`.
  - `useTelemetry.ts` still excludes deleted routes (`account-reorder`, `manage-hierarchy`) and lacks all 5 `(tabs)/*` entries.
  - 4 routes have `isModal` settings contradicting their actual stack presentation.
* **Suggestion:** Create a single canonical `src/navigation/routeManifest.ts` holding route path, title, modal status, privacy policy, and telemetry metadata. Derive all 7 registries from this single manifest.

**Implementation status:** `routeManifest.ts` now exists, and `AppNavigation.tsx` plus
`useTelemetry.ts` derive their route definitions from it. The privacy allow-list in
`observabilityPrivacy.ts` remains an independent registry and is intentionally tracked as
follow-up work; it must be migrated before claiming all route registries share one source of truth.

---

### B. Unsaved Work Protection on Modal Swipe-Down
* **Problem:** In [`AppNavigation.tsx`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/app/components/AppNavigation.tsx), 8 form screens configure `gestureDirection: 'vertical'`. However, only 2 screens implement `usePreventRemove`.
* **Impact:** An accidental downward swipe silently dismisses in-progress edits in Budgets, Planned Payments, SMS Rules, Accounts, and Categories.
* **Suggestion:** Introduce a reusable `useConfirmUnsavedChanges({ isDirty, onDiscard })` hook and apply it to the remaining 6 form modal screens.

---

### C. Reports Strategy: Dual Presence with Clean Boundary (No Deletion)
* **Current State:**
  - Reports V1: [`src/features/reports/`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/reports) via [app/reports.tsx](file:///Users/sahilsoni/me/projects/full-frills-balance/app/reports.tsx)
  - Reports V2: [`src/features/reports-v2/`](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/reports-v2) via [app/reports-v2.tsx](file:///Users/sahilsoni/me/projects/full-frills-balance/app/reports-v2.tsx)
* **Policy:** **Reports V1 is explicitly NOT deleted.** It remains active and accessible.
* **Suggestion:**
  - Keep [app/reports.tsx](file:///Users/sahilsoni/me/projects/full-frills-balance/app/reports.tsx) pointing to Reports V1.
  - Add an optional preferences toggle (`usePreferences().reportsV2Enabled`) or header toggle allowing users/testers to switch to Reports V2 cleanly, without removing or disrupting Reports V1.

---

### D. Redundant Account vs. Category Creation Routes
* **Files:**
  - [src/features/accounts/screens/AccountCreationScreen.tsx](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/accounts/screens/AccountCreationScreen.tsx)
  - [src/features/accounts/screens/CategoryCreationScreen.tsx](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/accounts/screens/CategoryCreationScreen.tsx)
  - [app/account-creation.tsx](file:///Users/sahilsoni/me/projects/full-frills-balance/app/account-creation.tsx)
  - [app/category-creation.tsx](file:///Users/sahilsoni/me/projects/full-frills-balance/app/category-creation.tsx)
* **Problem:** Screen files are byte-for-byte identical. The view model determines category mode via URL checking (`usePathname()`).
* **Suggestion:** Re-export `CategoryCreationScreen = AccountCreationScreen` so duplicate component code is eliminated while keeping Expo Router URLs backward compatible.

---

## 5. Phase 3: Design System Adoption & Architecture Ratchets

From the design-system audit ([`docs/audits/design-system-adoption-2026-10-04.md`](file:///Users/sahilsoni/me/projects/full-frills-balance/docs/audits/design-system-adoption-2026-10-04.md)):

### Adoption Metrics
| Metric | Count | Impact & Notes |
|---|---|---|
| Raw `View` imports in features | 136 files | `VoiceInputModal` (21), `RuleFlowPreview` (26), `SafeToSpendLegendModal` (25) |
| `TouchableOpacity` vs `Pressable` | 259 vs 28 | `android_ripple` used only once (`HubWidget.tsx`) |
| Non-scale spacing values | 189 occurrences | Hardcoded padding/margins break visual rhythm |
| `borderWidth: 1` vs `hairlineWidth` | 87 vs 33 | Inconsistent border line weight across devices |
| Accessibility coverage | ~24% features, ~11% components | Interactive elements lack `accessibilityRole` / `accessibilityLabel` |
| `Animated` files missing reduced motion | 8 files | `ProgressBar`, `VoiceInputModal`, `SwipeToRemove`, `Toast`, etc. |
| Elevation bypasses | 7 files | Values like `elevation: 100` (`LineChart.tsx:268`) |

### Recommended CI Ratchet Scripts
Add to `scripts/` and wire into `bun run check:architecture`:
1. `check-route-registry-agreement.mjs`: Asserts every route in `app/` is mapped in `routeManifest.ts`.
2. `check-query-ordering-parity.mjs`: Enforces that any SQLite raw query and ORM fallback sharing an ORDER BY clause declare identical tie-breakers.
3. `check-storage-ownership.mjs`: Ensures direct MMKV storage calls occur only within `services/preferences/`.
4. `check-design-system-primitives.mjs`: Report-only baseline of raw primitive imports.

---

## 6. Actionable Implementation Checklist (31-Commit Sequence)

Work through this sequence commit-by-commit. Run `bun run verify` (or `bun test`) between each step.

### Block 1: Phase 0 Correctness (Steps 1–8)
- [x] **Step 1:** `fix(reports): correct heatmap day index + assert Monday-first` ([0.1](file:///Users/sahilsoni/me/projects/full-frills-balance/src/services/reports/heatmapCalculators.ts#L32))
  - Normalize calculator index: `(dt.day() + 6) % 7`.
  - Add unit test asserting Monday spending lands in column 0 and Sunday in column 6.
- [x] **Step 2:** `fix(reports): add id tie-breaker to ORM fallback ordering` ([0.2](file:///Users/sahilsoni/me/projects/full-frills-balance/src/data/repositories/raw/TransactionRawMetricsQueries.ts#L192))
  - Add `Q.sortBy('id', Q.desc)` to ORM fallback in `TransactionRawMetricsQueries.ts`.
- [x] **Step 3:** `test(reports): adapter-parity regression for latest balance` ([0.2](file:///Users/sahilsoni/me/projects/full-frills-balance/src/data/repositories/raw/TransactionRawMetricsQueries.ts))
  - Write test verifying SQL and ORM paths yield identical latest balance on duplicate timestamps.
- [x] **Step 4:** `fix(journal): reject negative sign at amount input boundary` ([0.3](file:///Users/sahilsoni/me/projects/full-frills-balance/src/services/journal/simpleJournalHelpers.ts#L12))
  - Ensure negative sign paste is stripped or rejected; validate positive amounts at posting boundary.
- [x] **Step 5:** `test(journal): pin posting-boundary validation` ([0.3](file:///Users/sahilsoni/me/projects/full-frills-balance/src/services/journal/splitJournalHelpers.ts#L443))
  - Test zero and negative validation rules.
- [x] **Step 6:** `fix(currency): normalize currency codes before precision lookup` ([0.4](file:///Users/sahilsoni/me/projects/full-frills-balance/src/utils/currencyFormatter.ts))
  - Trim and uppercase currency codes; centralize default fallback.
- [x] **Step 7:** `test(settings): enumerate every search focus id, assert target` ([0.5](file:///Users/sahilsoni/me/projects/full-frills-balance/src/components/settings/SettingsMenuItem.tsx#L158))
  - Enumerate catalog IDs and assert each target registers in the registry.
- [x] **Step 8:** `fix(accounts): return to composer when hand-back target exists` ([0.6](file:///Users/sahilsoni/me/projects/full-frills-balance/src/features/accounts/hooks/useAccountPersistence.ts#L118))
  - Respect origin return target on first-account save.

### Block 2: Phase 1 Component De-duplication & Primitives (Steps 9–19)
- [x] **Step 9:** `chore(design-system): delete Inset, migrate consumers to Box`
  - Migrate all 13 `<Inset>` callers to `<Box padding="...">`, then remove `Inset.tsx`.
- [x] **Step 10:** `chore(design-system): collapse Inline into Stack`
  - Make `Inline.tsx` an export alias over `Stack.tsx(direction="row")`.
- [x] **Step 11:** `refactor(settings): rename shadowed settings wrappers`
  - Rename feature `SettingsMenuItem.tsx` → `SettingsSearchMenuItem.tsx`.
  - Rename feature `SettingsMenu.tsx` → `SettingsMenuSection.tsx`.
- [x] **Step 12:** `refactor(components): migrate manual divider styles to Separator`
  - Replace 23 raw `{ height: 1, backgroundColor: theme.divider }` styles with `<Separator />`.
- [x] **Step 13:** `feat(design-system): extract NoticeBanner with tone support`
  - Unify `EntryInlineError`, `EntryEditBanner`, `IncompleteFxWarning`.
- [x] **Step 14:** `feat(charts): BudgetProgressBar absorbs ProgressBar`
  - Migrate the single `ProgressBar` consumer to `BudgetProgressBar`; remove `ProgressBar.tsx`.
- [x] **Step 15:** `feat(filters): CurrencyPickerSheet delegates to SelectionPickerSheet`
  - Consolidate currency picker onto tested `SelectionPickerSheet`.
- [x] **Step 16:** `refactor(setup): replace local fade animations with FadeIn`
  - Adopt shared `FadeIn` component in `welcome.tsx` and `conversationUi.tsx`.
- [x] **Step 17:** `refactor(accounts): re-export CategoryCreationScreen from AccountCreationScreen`
  - Deduplicate screen files without breaking routes.
- [x] **Step 18:** `feat(forms): enhance CalculatorAmountInput and SubmitFooter`
  - Delegate `SimpleFormAmountInput` to `CalculatorAmountInput`.
- [x] **Step 19:** `feat(overlays): migrate SubAccountListModal & BaseAccountPickerModal to ModalSurface`
  - Replace raw React Native modals and bespoke spring animations with `ModalSurface`.

### Block 2: Phase 2 Navigation, Unsaved Work & Registries (Steps 20–25)
- [x] **Step 20:** `feat(navigation): create routeManifest.ts`
  - Declare canonical routes with title, privacy, modal, and telemetry tags.
- [x] **Step 21:** `refactor(navigation): derive AppNavigation and useTelemetry from routeManifest`
  - Note: `observabilityPrivacy.ts` still has a separate allow-list; complete that migration before considering route-registry consolidation fully complete.
  - Eliminate dead routes (`account-reorder`, `manage-hierarchy`) and register `(tabs)/*`.
- [x] **Step 22:** `feat(forms): add usePreventRemove to 6 modal form flows`
  - Protect budgets, planned payments, SMS rules, and account forms from swipe-down data loss.
- [x] **Step 23:** `feat(reports): introduce clean toggle/link for Reports V2 (preserving V1)`
  - Keep Reports V1 active; expose V2 cleanly via preference or entry point.
- [ ] **Step 24:** `chore(architecture): add check-route-registry-agreement script`
  - Add CI check validating `app/` routes against `routeManifest.ts`.
- [ ] **Step 25:** `chore(architecture): add check-query-ordering-parity script`
  - Add CI check validating SQLite and ORM ordering parity.

### Block 4: Phase 3 State, Services & Design System Polish (Steps 26–31)
- [ ] **Step 26:** `refactor(preferences): consolidate facade into single read API`
  - Standardize preferences hooks on scoped stores; eliminate inline subscribe closures.
- [ ] **Step 27:** `refactor(preferences): eliminate duplicated per-hook defaults`
  - Source defaults directly from preferences bag constants.
- [ ] **Step 28:** `refactor(services): fix AuditRepository to preferences layer inversion`
  - Pass preferences to audit service rather than repository importing preferences.
- [ ] **Step 29:** `refactor(observables): route account queries through ReactiveCacheCoordinator`
  - Eliminate redundant independent subscriptions across `useAccounts`.
- [ ] **Step 30:** `refactor(a11y): add useReducedMotion guards to 8 Animated files`
  - Guard `VoiceInputModal`, `ProgressBar`, `Toast`, etc.
- [ ] **Step 31:** `chore(architecture): add report-only check-design-system-primitives script`
  - Track raw primitive usage in CI without failing builds.

---

## 7. Definition of Done & Success Criteria

1. **Zero Silent Calculation Bugs:** Heatmap day alignment verified; SQL/ORM tie-breaker test passes.
2. **Zero Inadvertent Data Loss:** Swipe-down gestures on all 8 modal forms prompt confirmation when dirty.
3. **No Name Shadowing:** No feature components share identical filenames with common components.
4. **Reports V1 Intact:** Existing Reports V1 screens and flows function without disruption.
5. **Single Route Truth:** Navigation, telemetry, and privacy share `routeManifest.ts`.
6. **Full Test Suite Green:** All 460 suites and 2,853 tests pass with zero regressions.
