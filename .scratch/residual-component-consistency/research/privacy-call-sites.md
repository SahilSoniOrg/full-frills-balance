# Privacy call-site inventory vs #6 contract

**GitHub:** [#30 Inventory privacy masking call sites vs #6 contract](https://github.com/SahilSoniOrg/full-frills-balance/issues/30)  
**Parent map:** [#29 Residual component consistency](https://github.com/SahilSoniOrg/full-frills-balance/issues/29)  
**Binding baseline:** [#6 Component architecture fix — decision map](https://github.com/SahilSoniOrg/full-frills-balance/issues/6)

**Research date:** 2026-08-04  
**Repo path:** `/Users/sahilsoni/me/projects/full-frills-balance`

---

## #6 privacy contract (summary)

From issue #6 charting locks and `src/contexts/PrivacyScope.tsx`:

| Rule | Meaning |
|------|---------|
| **Effective mode** | `scope?.isPrivacyMode ?? globalPrivacyMode` — all amount masking must read this, not raw global prefs. |
| **Sticky override** | `override ?? global`; toggling sets override relative to current effective value; global pref changes do **not** clear an existing override until the user toggles again (“charting lock”). |
| **`PrivacyScopeProvider`** | Composes `usePrivacyPrefs` + `useScreenPrivacyMode`; required for screens with a local eye toggle. |
| **`usePrivacyScope`** | Screen-local toggle API; **must** be under `PrivacyScopeProvider` (throws otherwise). |
| **`useEffectivePrivacyMode`** | Masking hook for VMs/leaves; respects nearest provider scope, else global. |
| **`usePrivacyPrefs`** | Global prefs read/write only — correct for settings toggles, app lock, widget privacy flag; **not** for balance masking on feature screens. |

Wave A scope (#29): integrity + tab alignment — privacy enforcement on five tabs + Commitments/Hub/Journal-search/Budget Screen→VM→View.

---

## 1. Call-site table

### 1a. Hook / provider consumers

| File | Hook / API | Balance-bearing | Role / notes |
|------|------------|-----------------|--------------|
| `src/contexts/PrivacyScope.tsx` | `usePrivacyPrefs` (internal) | N | Provider + `useEffectivePrivacyMode` implementation |
| `src/contexts/__tests__/PrivacyScope.test.tsx` | Provider, `useEffectivePrivacyMode`, `usePrivacyScope` | N | Contract tests (sticky override, fallback) |
| `src/hooks/usePrivacyPrefs.ts` | **definition** | N | Global prefs store |
| `src/hooks/useScreenPrivacyMode.ts` | **definition** | N | Sticky override state machine |
| `src/features/dashboard/screens/DashboardScreen.tsx` | `PrivacyScopeProvider` | **Y** | Wraps dashboard; has eye toggle |
| `src/features/dashboard/hooks/useDashboardViewModel.ts` | `usePrivacyScope` | **Y** | Toggle + passes `isPrivacyMode` to STS/feed leaves |
| `src/features/dashboard/hooks/useSafeToSpendView.ts` | *(prop `uiState.isPrivacyMode`)* | **Y** | Leaf — no hook; receives flag from VM ✓ |
| `src/features/accounts/screens/AccountsListScreen.tsx` | `PrivacyScopeProvider` | **Y** | Wraps accounts list; has eye toggle |
| `src/features/accounts/hooks/useAccountsListViewModel.ts` | `usePrivacyScope` | **Y** | Toggle + masking for list/net-worth cards |
| `src/features/accounts/screens/AccountDetailsScreen.tsx` | `PrivacyScopeProvider` | **Y** | Wraps details (no eye toggle in chrome) |
| `src/features/accounts/hooks/useAccountDetailsViewModel.ts` | `usePrivacyScope` | **Y** | Masking only (no toggle exposed) — OK inside provider |
| `src/features/journal/hooks/useJournalListScreen.ts` | **`usePrivacyPrefs`** | **Y** | **Contradiction** — masks tx amounts via global only |
| `src/features/journal/list/screens/JournalSearchScreen.tsx` | **`usePrivacyPrefs`** | **Y** | **Contradiction** — hook in Screen, not VM |
| `src/features/hub/screens/HubScreen.tsx` | `useEffectivePrivacyMode` | **Y** | Hub insight amounts ✓ |
| `src/features/hub/hooks/useInsightDetailsViewModel.ts` | **`usePrivacyPrefs`** | **Y** | **Contradiction** — sibling screen uses effective mode |
| `src/features/budget/hooks/useBudgetListViewModel.ts` | `useEffectivePrivacyMode` | **Y** | Commitments budgets tab ✓ |
| `src/features/budget/hooks/useBudgetDetailViewModel.ts` | **`usePrivacyPrefs`** | **Y** | **Contradiction** — budget header + tx list |
| `src/features/commitments/screens/CommitmentsScreen.tsx` | *(via `useBudgetListViewModel`)* | **Y** | Inherits `useEffectivePrivacyMode` for both tabs |
| `src/features/planned-payments/screens/PlannedPaymentListScreen.tsx` | `useEffectivePrivacyMode` | **Y** | Orphan route (#31); masking API correct |
| `src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel.ts` | `useEffectivePrivacyMode` | **Y** | Planned payment amounts ✓ |
| `src/features/planned-payments/hooks/usePlannedOccurrenceActions.ts` | `useEffectivePrivacyMode` | **Y** | Confirm-dialog amount masking ✓ |
| `src/features/settings/hooks/usePrivacySettingsViewModel.ts` | `usePrivacyPrefs` | N | Settings toggle — correct use of raw prefs |
| `src/features/app/components/AppLockInterceptor.tsx` | `usePrivacyPrefs` (`isAppLockEnabled`) | N | Lock gate — not masking |
| `src/features/app/hooks/useAppLockEngine.ts` | `usePrivacyPrefs` (`isAppLockEnabled`) | N | Lock engine — not masking |
| `src/features/app/hooks/useWidgetSync.ts` | `usePrivacyPrefs` (`isWidgetPrivacyEnabled`) | **Y** | Widget snapshot uses separate widget-privacy flag, not `isPrivacyMode` |

### 1b. `PrivacyScopeProvider` mount points (only 3)

| Screen | Provider | Local eye toggle |
|--------|----------|------------------|
| Dashboard | ✓ | ✓ (`DashboardHeader`) |
| Accounts list | ✓ | ✓ (`AccountsListView`) |
| Account details | ✓ | ✗ (inherits scope; no toggle in header) |

All other balance-bearing Wave A screens run **without** a provider (effective mode = global prefs only).

### 1c. Balance-bearing screens — privacy hook summary

| Screen / flow | VM / screen hook | Provider | Wave A |
|---------------|------------------|----------|--------|
| Dashboard | `usePrivacyScope` | ✓ | ✓ |
| Accounts list | `usePrivacyScope` | ✓ | ✓ |
| Account details | `usePrivacyScope` | ✓ | ✓ |
| Journal (tab) | **`usePrivacyPrefs`** via `useJournalListScreen` | ✗ | ✓ |
| Journal search | **`usePrivacyPrefs`** in Screen | ✗ | ✓ |
| Commitments | `useEffectivePrivacyMode` via budget VM | ✗ | ✓ |
| Budget detail | **`usePrivacyPrefs`** | ✗ | ✓ |
| Hub | `useEffectivePrivacyMode` in Screen | ✗ | ✓ |
| Insight details | **`usePrivacyPrefs`** | ✗ | ✓ (Hub child) |
| Planned payment list (orphan) | `useEffectivePrivacyMode` | ✗ | orphan |
| Planned payment detail | `useEffectivePrivacyMode` | ✗ | Commitments child |
| Reports (from Journal) | **none** | ✗ | linked, not tab |
| Transaction details | **none** | ✗ | drill-down |
| Journal entry (compose) | **none** | ✗ | compose flow |

### 1d. `AppConfig.privacyMask` masking sites (leaves — prop-driven)

These do **not** call privacy hooks; they mask when `isPrivacyMode` prop is true. Included because incorrect upstream hook breaks them.

| File | Receives `isPrivacyMode` from |
|------|-------------------------------|
| `src/features/dashboard/utils/formatAmount.ts` | prop |
| `src/features/dashboard/components/DashboardSummary.tsx` | prop |
| `src/features/dashboard/components/PlannedPaymentsSection.tsx` | prop |
| `src/features/dashboard/mappers/SafeToSpendMapper.ts` | prop |
| `src/components/common/CashFlowCard.tsx` | prop |
| `src/components/common/NetWorthCard.tsx` | prop |
| `src/components/common/TransactionCard.tsx` | prop |
| `src/components/common/JournalDayHeader.tsx` | prop |
| `src/features/accounts/components/AccountCard.tsx` | prop |
| `src/features/accounts/components/AccountsListView.tsx` | prop (inline mask) |
| `src/features/accounts/components/AccountDetailsHeader.tsx` | prop |
| `src/features/accounts/hooks/details/useAccountDetailsMetrics.ts` | prop |
| `src/features/accounts/hooks/details/useAccountDetailsData.ts` | prop |
| `src/features/accounts/hooks/details/useAccountHierarchyTree.ts` | prop |
| `src/features/budget/components/BudgetCard.tsx` | prop |
| `src/features/budget/components/BudgetDetailHeader.tsx` | prop |
| `src/features/planned-payments/components/PlannedPaymentCard.tsx` | prop |
| `src/features/planned-payments/hooks/plannedPaymentDetailsActions.ts` | options |
| `src/features/hub/components/HubWidget.tsx` | prop |
| `src/features/hub/screens/InsightDetailsScreen.tsx` | VM (`usePrivacyPrefs` ⚠️) |

### 1e. Balance-bearing surfaces with **no** privacy masking

| File / flow | Issue |
|-------------|-------|
| `src/features/reports/**` | `CurrencyFormatter.format` with no `isPrivacyMode` gate |
| `src/features/journal/hooks/useTransactionDetailsViewModel.ts` | Amount text always formatted |
| `src/features/journal/entry/components/JournalLineItem.tsx` | Compose amounts always visible |
| `src/features/journal/entry/components/JournalSummary.tsx` | Totals always visible |

---

## 2. Ranked contradictions (Wave A must-fix first)

### P0 — Raw `usePrivacyPrefs` used for amount masking (violates “masking via effective mode”)

These four call sites bypass `useEffectivePrivacyMode`. On screens **with** `PrivacyScopeProvider` elsewhere in the app, a user’s sticky local override (eye toggle on Dashboard/Accounts) does not affect global prefs — but any screen reading `usePrivacyPrefs` still follows global only, causing **cross-screen masking drift** (e.g. user hides amounts on Dashboard, Journal tab still shows transaction amounts).

| Rank | File | Fix |
|------|------|-----|
| 1 | `src/features/journal/hooks/useJournalListScreen.ts` | Replace `usePrivacyPrefs` → `useEffectivePrivacyMode` |
| 2 | `src/features/journal/list/screens/JournalSearchScreen.tsx` | Move privacy read into `useJournalSearchViewModel`; use `useEffectivePrivacyMode` |
| 3 | `src/features/budget/hooks/useBudgetDetailViewModel.ts` | Replace `usePrivacyPrefs` → `useEffectivePrivacyMode` |
| 4 | `src/features/hub/hooks/useInsightDetailsViewModel.ts` | Replace `usePrivacyPrefs` → `useEffectivePrivacyMode` |

**Why Journal first:** Journal is a primary tab, explicitly named in Wave A; highest traffic + clearest privacy leak when global ≠ effective.

### P1 — Wave A Screen→VM violation (Journal search)

| Rank | File | Issue |
|------|------|-------|
| 5 | `src/features/journal/list/screens/JournalSearchScreen.tsx` | Screen calls `usePrivacyPrefs` directly instead of VM owning privacy state (#29 chrome/VM contract) |

Fix together with P0 #2: extend `useJournalSearchViewModel` to expose `isPrivacyMode`.

### P1 — Hub feature inconsistency

| Rank | Files | Issue |
|------|-------|-------|
| 6 | `HubScreen.tsx` vs `useInsightDetailsViewModel.ts` | Parent uses `useEffectivePrivacyMode`; child VM uses `usePrivacyPrefs` — inconsistent API and behavior if scope is added later |

### P2 — Missing masking on balance-bearing drill-downs (out of Wave A tab DoD but user-visible)

| Rank | Surface | Issue |
|------|---------|-------|
| 7 | Reports (`src/features/reports/**`) | No privacy hook at VM layer; charts/tooltips always show amounts |
| 8 | Transaction details | No masking on `amountText` / splits |
| 9 | Journal entry compose | Amounts always visible (may be intentional for data entry) |

### P3 — Architectural gaps (defer to #32 unless Wave A adds eye toggles)

| Gap | Notes |
|-----|-------|
| No `PrivacyScopeProvider` on Journal / Commitments / Hub / Budget detail | Acceptable if no local toggle; masking still must use `useEffectivePrivacyMode` |
| Per-screen providers reset override on navigation | By #6 design (`useScreenPrivacyMode` is per-mount); not a bug |
| `useWidgetSync` uses `isWidgetPrivacyEnabled`, not `isPrivacyMode` | Separate product flag; document in #32 |

---

## 3. Recommended enforcement checklist (Wave A)

Use this as acceptance criteria for [#32 Privacy enforcement shape for Wave A](https://github.com/SahilSoniOrg/full-frills-balance/issues/32).

### API rules

- [ ] **Masking:** Any code that gates `AppConfig.privacyMask` or hides balance text must receive `isPrivacyMode` from `useEffectivePrivacyMode()` (VM/screen hook) or from a parent that called it — never from `usePrivacyPrefs().isPrivacyMode`.
- [ ] **Toggle:** Only screens with an eye icon call `usePrivacyScope()` and wrap with `PrivacyScopeProvider`.
- [ ] **Settings:** Only `usePrivacySettingsViewModel` (and `PrivacyScopeProvider` internals) call `usePrivacyPrefs` for `isPrivacyMode` write/read tied to the global toggle.
- [ ] **Leaves:** Presentational components (`*View`, `*Card`, `TransactionListView`, chart formatters) take `isPrivacyMode` as a prop — no privacy hooks in leaves.

### Screen rules (Wave A tabs + named flows)

- [ ] **Dashboard / Accounts:** Keep `PrivacyScopeProvider` + `usePrivacyScope` in VM; verify `isPrivacyMode` threaded to all STS/feed/net-worth leaves.
- [ ] **Journal tab:** `useJournalListScreen` → `useEffectivePrivacyMode`; optional future: provider if eye toggle added to chrome.
- [ ] **Journal search:** VM owns `isPrivacyMode`; Screen is prop-only.
- [ ] **Commitments:** Keep `useBudgetListViewModel` → `useEffectivePrivacyMode`; planned tab reuses same flag ✓.
- [ ] **Budget detail:** VM → `useEffectivePrivacyMode`.
- [ ] **Hub + Insight details:** Both use `useEffectivePrivacyMode`.
- [ ] **Planned payments:** Already on `useEffectivePrivacyMode` ✓.

### Verification

- [ ] Grep gate (CI or pre-commit): fail on `usePrivacyPrefs` imports in `src/features/**` except allowlist: `settings/**`, `app/**` (lock/widget), and `contexts/PrivacyScope.tsx`.
- [ ] Extend `PrivacyScope.test.tsx` or add integration test: global hidden → Dashboard toggle show → Journal still hidden until global changes (documents per-screen override boundary).
- [ ] Manual 30s trace (#29 DoD): toggle privacy on Dashboard → navigate Journal, Commitments, Hub, Budget detail — confirm no screen shows raw amounts when global privacy is on (post P0 fixes).

### Out of scope for Wave A (track separately)

- Reports / transaction-details / journal-entry masking (P2).
- App-root `PrivacyScopeProvider` vs per-screen providers (#32 decision).
- Widget privacy (`isWidgetPrivacyEnabled`) semantics vs in-app `isPrivacyMode`.

---

## Appendix: grep commands used

```bash
rg 'PrivacyScopeProvider' 
rg 'usePrivacyScope'
rg 'useEffectivePrivacyMode'
rg 'usePrivacyPrefs'
rg 'isPrivacyMode'
rg 'AppConfig\.privacyMask'
```
