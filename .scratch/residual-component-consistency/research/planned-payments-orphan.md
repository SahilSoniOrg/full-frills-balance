# Research: Planned-payments list route orphan status

**GitHub issue:** [#31 — Confirm planned-payments list route is orphaned](https://github.com/SahilsoniOrg/full-frills-balance/issues/31)  
**Parent map:** [#29 — Residual component consistency — decision map](https://github.com/SahilsoniOrg/full-frills-balance/issues/29)  
**Date:** 2026-08-04  
**Question:** Is `app/planned-payments.tsx` / `PlannedPaymentListScreen` / `AppNavigation.toPlannedPayments` dead in-app (Commitments tab is the only product entry)?

---

## Executive summary

**Yes — the standalone planned-payments list route is dead in-app.** No production code calls `AppNavigation.toPlannedPayments()`. All product entry points route through the **Commitments** tab (`app/(tabs)/commitments.tsx` → `CommitmentsScreen`), which embeds `PlannedPaymentListView` directly. The orphan trio duplicates that list UI behind a stack route with a back button.

**Recommendation for Wave A: DELETE** the three orphan artifacts. Keep `PlannedPaymentListView`, form/details routes, hooks, and services — they remain actively used.

---

## Evidence table

| Artifact | Path | In-app callers | E2E coverage | Deep-link / route risk | Verdict |
|---|---|---|---|---|---|
| Route file | `app/planned-payments.tsx` | **0** — only imports `PlannedPaymentListScreen` | **None** — E2E uses `/commitments` | **Reachable** via Expo file-based routing (`fullfrillsbalance://planned-payments`) but no widget/docs link to it | **Orphan** |
| Screen | `src/features/planned-payments/screens/PlannedPaymentListScreen.tsx` | **1** — only `app/planned-payments.tsx` | **None** | N/A (not independently linked) | **Orphan** |
| Nav helper | `AppNavigation.toPlannedPayments` in `src/utils/navigation.ts:455–457` | **0** — defined but never invoked (`toPlannedPayments(` grep = 0 matches) | **None** | Would push `/planned-payments` if called; currently unreachable from UI | **Dead code** |
| Product entry | `CommitmentsScreen` via `app/(tabs)/commitments.tsx` | Tab bar (`TabsLayout.tsx` → `tab-commitments`) | **All** planned-payment E2E flows | `/commitments` is the canonical URL | **Active** |
| Shared list view | `PlannedPaymentListView` | `CommitmentsScreen` (planned tab) + `PlannedPaymentListScreen` (orphan) | Indirect via Commitments | N/A | **Keep** — SSOT for list rendering |
| Form route | `app/planned-payment-form.tsx` | `CommitmentsScreen`, `usePlannedPaymentDetails`, orphan `PlannedPaymentListScreen` FAB | Yes (create flow) | Reachable; actively navigated to | **Keep** |
| Details route | `app/planned-payment-details.tsx` | `PlannedPaymentListView`, dashboard STS modal/ledger | Yes (post occurrence) | Reachable; actively navigated to | **Keep** |

---

## Caller analysis

### `AppNavigation.toPlannedPayments`

Defined at `src/utils/navigation.ts:455–457`:

```ts
toPlannedPayments: () => {
  router.push('/planned-payments' as Href);
},
```

**Call-site search:** `toPlannedPayments(` → **0 matches** repo-wide.  
Contrast with sibling helpers that *are* called: `toPlannedPaymentForm` (CommitmentsScreen, PlannedPaymentListScreen FAB, usePlannedPaymentDetails), `toPlannedPaymentDetails` (PlannedPaymentListView, SafeToSpendLedger, SafeToSpendExplanationModal).

### `PlannedPaymentListScreen`

**Call-site search:** `PlannedPaymentListScreen` → only:

- `app/planned-payments.tsx` (route wrapper)
- `src/features/planned-payments/index.ts` (re-export)

No tab, hub widget, dashboard section, or settings link navigates here.

### `CommitmentsScreen` (active product entry)

`src/features/commitments/screens/CommitmentsScreen.tsx`:

- Mounted at `app/(tabs)/commitments.tsx`
- Tab registered in `src/features/app/TabsLayout.tsx` (`tab-commitments`)
- "Planned" sub-tab renders `PlannedPaymentListView` + `usePlannedPayments` (same data hook as orphan screen)
- FAB calls `AppNavigation.toPlannedPaymentForm()` (not `toPlannedPayments`)

### Duplication note

`PlannedPaymentListScreen` and `CommitmentsScreen` (planned tab) are functionally redundant:

| Concern | `PlannedPaymentListScreen` | `CommitmentsScreen` (planned tab) |
|---|---|---|
| List component | `PlannedPaymentListView` | `PlannedPaymentListView` |
| Data hook | `usePlannedPayments` | `usePlannedPayments` |
| Privacy | `useEffectivePrivacyMode()` | `isPrivacyMode` from `useBudgetListViewModel` |
| Chrome | `Screen` with `showBack={true}`, title "Planned Payments" | Tab screen, `showBack={false}`, title "Commitments", budgets/planned tabs |
| FAB | `toPlannedPaymentForm()` | `toPlannedPaymentForm()` (when planned tab active) |

The orphan screen is a legacy standalone stack page superseded by the Commitments tab integration.

---

## E2E coverage

All planned-payment E2E flows enter via **Commitments**, not `/planned-payments`.

| Suite | File | Entry path | Notes |
|---|---|---|---|
| Playwright | `e2e/planned-payments.test.ts` | `plannedPaymentsPage.openPlannedTab()` → `page.goto('/commitments')` | Creates payment, posts occurrence |
| Playwright page object | `e2e/pages/planned-payments-page.ts:7` | `goto('/commitments')` then clicks "Planned" tab | No reference to `/planned-payments` |
| Detox / mobile | `e2e/actions/mobile/flows.ts:100–111` | `openCommitmentsTab()` → `commitments-tabs-item-planned` | `createPlannedPayment` flow |
| Detox spec | `e2e/specs/planned-payments/planned-payments.e2e.ts` | Uses `createPlannedPayment` (Commitments path) | Seed profile `planned-payments` is data-only |

**No E2E test navigates to `/planned-payments` or asserts `PlannedPaymentListScreen` chrome** (back button, "Planned Payments" standalone title). Deleting the orphan route will not break existing E2E.

---

## Deep-link risk

### Route discoverability

Expo Router file-based routing auto-registers `app/planned-payments.tsx` as `/planned-payments`. The app scheme is `fullfrillsbalance` (`app.config.ts:53`), so `fullfrillsbalance://planned-payments` resolves on cold start.

`RootIndexScreen` (`src/features/app/RootIndexScreen.tsx`) explicitly allows non-root deeplinks through:

> If cold-started with a deeplink to a specific route, let Expo Router handle it

### External link inventory

| Source | Links to `/planned-payments`? |
|---|---|
| Widget deeplinks (`plugins/withJournalLauncherWidget.js`) | **No** — widgets link to `journal-entry` (documented in RootIndexScreen comment) |
| In-app navigation | **No** — zero `toPlannedPayments` callers |
| E2E / test fixtures | **No** |
| Docs / markdown / native code | **No** matches for `planned-payments` path |
| `NavigationStack` explicit screens (`AppNavigation.tsx`) | **No** — route relies on file discovery only |

### Risk assessment

| Risk | Level | Mitigation on DELETE |
|---|---|---|
| Bookmarked user URL `fullfrillsbalance://planned-payments` | Low | Route 404s; optional redirect to `/commitments` with planned tab param if desired (not required for Wave A) |
| Programmatic link from unreleased build | Very low | No evidence in repo |
| Breaking active flows | **None** | Form/details routes (`/planned-payment-form`, `/planned-payment-details`) remain; only list route removed |

---

## Wave A alignment (#29)

Issue #29 explicitly lists **"orphan planned-list delete"** as a Wave A integrity item alongside tab alignment. This research confirms the list route is the orphan; the broader `planned-payments` feature (form, details, hooks, services, `PlannedPaymentListView`) is **not** orphaned.

---

## Recommendation: DELETE for Wave A

### Delete (3 artifacts)

1. `app/planned-payments.tsx`
2. `src/features/planned-payments/screens/PlannedPaymentListScreen.tsx`
3. `AppNavigation.toPlannedPayments` (+ JSDoc block) in `src/utils/navigation.ts`

Also remove `PlannedPaymentListScreen` from `src/features/planned-payments/index.ts` exports.

### Keep (actively used)

- `PlannedPaymentListView` — rendered by `CommitmentsScreen`
- `usePlannedPayments`, `usePlannedPaymentForm`, `usePlannedPaymentDetails`, etc.
- `app/planned-payment-form.tsx`, `app/planned-payment-details.tsx`
- `AppNavigation.toPlannedPaymentForm`, `toPlannedPaymentDetails`
- All `src/services/planned-payment/*` and data layer
- `AppConfig.strings.plannedPayments.*` (used by form, details, cards, Commitments empty states)

### Optional (not required for Wave A)

- Add redirect `app/planned-payments.tsx` → `/commitments` if paranoid about deeplink bookmarks (YAGNI unless telemetry shows hits)
- Align privacy sourcing in Commitments planned tab (`useBudgetListViewModel` vs `useEffectivePrivacyMode`) — separate #32/#33 concern

### Estimated blast radius

- **Files touched:** 3–4
- **Tests broken:** 0 (no unit/E2E references to orphan route)
- **User-visible change:** None for normal flows (Commitments tab unchanged)

---

## Search commands run

```bash
rg 'toPlannedPayments' .
rg 'toPlannedPayments\(' .
rg 'planned-payments' .
rg 'PlannedPaymentListScreen' .
rg 'CommitmentsScreen' .
rg 'PlannedPaymentListView' .
rg 'goto\(.*/planned-payments|href.*planned-payments|router\.(push|replace).*planned-payments' .
rg 'planned-payments' --glob '*.{md,swift,kt,xml}'
```
