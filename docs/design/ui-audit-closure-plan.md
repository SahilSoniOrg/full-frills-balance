# UI audit closure plan

**Goal:** Close real interaction bugs first, resolve a few product decisions, then drive consistency in slices — not a repo-wide rewrite.

**Baseline:** Checklist verified at `fb7d5cfdb`. Progress through `2164e9b58`. Treat checklist §8 “Closed” as done. Do not reopen those items.

**Status overview:** Phase 0–2 closed. Phase 1 decisions locked. Phase 3 mostly closed (Journal, Capture deep extract, Reports polish, Audit). Phase 4 opportunistic. Phase 5 verified.

---

## Phase 0 — Quick wins (no product decisions)

**Status: done** (`90f12a6db`).

| # | Work | Files | Done when |
|---|---|---|---|
| 0.1 | **DateRangeTrigger a11y** — `accessibilityRole="button"` + labels on prev/next/trigger; same pass on unlabeled date-menu pressables if cheap | `DateRangeTrigger.tsx`, `DateRangeMenuContent.tsx` | VoiceOver/TalkBack names the three controls |
| 0.2 | **Account Save hint** — wire `requirementHint` via `formatRequirementHint` when name empty / save disabled | `AccountFormView.tsx`, `useAccountFormViewModel.ts` | Disabled Save shows what to fix (matches Budget/Planned/Matcher) |

**Optional same PR:** underline thickness one-liner (matcher hairline → `1` or shared underline field) if already in account form files.

---

## Phase 1 — Product decision gates

Answer these before the related work; everything else can proceed in parallel. Exit: written decisions (even “defer”) so implementers don’t re-litigate. **Status: closed** (decisions below; verified against code + [reports capability matrix](reports-capability-matrix.md)).

### D1. Reports destination

- **Options:** keep both / Money overview primary / v1 primary / defer
- **Depends:** Reports consolidation, drawer entry, header PieChart action
- **Prep:** [reports-capability-matrix.md](reports-capability-matrix.md) — filters, empty chart, drilldown, error UI (evidence only)
- **Decision: Money overview primary (keep both implementations).** Drawer Explore should open Money overview (`/reports-v2`); keep v1 reachable from that screen’s header (swap today’s PieChart direction). Both still have unique value (v1’s polished Overview/Spending/Wealth vs v2’s broader sections + richer filters) — **do not merge** implementations yet.
- **Unblocks:** Phase 2 entry-point PR (drawer + header only). **Does not unblock:** deep Reports merge / deleting v1.

### D2. Sibling switching (Accounts/Categories, Budgets/Planned)

- **Current reality (as of `dc7f164f7`):** swipe + title picker (`HomeV2Subtabs` removed)
- **Options:** keep swipe+picker / simplify picker / defer
- **Depends:** nav chrome cleanup only; not Phase 0–2
- **Decision: keep swipe + picker.** After subtabs removal, `HomeV2PagePicker` still earns its keep: titled sibling options with short descriptions, a11y “choose A or B,” and an explicit swipe hint — gesture alone is not enough wayfinding.
- **Unblocks:** nothing mandatory. **Does not unblock / do not do:** picker simplification or further chrome removal in Phase 2.

### D3. Center Add scope

- **Options:** always include journal actions + contextual / keep contextual-only / defer
- **Depends:** `ContextualAddMenu` only
- **Decision: keep contextual-only.** `MENU_ACTIONS` already matches tab intent: journal tabs get expense/income/transfer; Accounts get account/category; Commitments get budget/planned. Journal create stays one primary-tab away; stacking journal onto Accounts/Plans would dilute the tab’s create affordance.
- **Unblocks:** nothing (no `ContextualAddMenu` follow-up). **Does not unblock:** always-journal Add menu work.

### D4. Form amount order / Planned success toast

- **Recommendation:** keep Planned amount-first (recurring amount is the hero); keep Account opening-balance after name; **skip** Planned success toast if `back()` already confirms save
- **Depends:** nothing else; document and close
- **Decision: closed as recommended.** Verified: Planned form leads with centered `CalculatorAmountInput` then name; Account form identity/name (and type) precede opening-balance `CalculatorAmountInput`; Planned save sets `leaveAfterSave → AppNavigation.back` with **no** `toast.success` (errors only). No form reorder or success-toast PR.
- **Unblocks:** nothing further for amount order / Planned toast.

### D5. Journal entry chrome

- **Recommendation:** don’t force `EntityFormScreen` yet; only unify if Close/title/mode/keyboard still broken
- **Depends:** journal chrome item — treat as spike, not commitment
- **Decision: spike-not-commitment / defer unify.** Journal keeps custom `ScreenWithChrome` header (Close + title + mode badge) and `JournalEntrySubmitBar`; `EntityFormScreen` is nav-chrome + `SubmitFooter` only and cannot host mode/keyboard/submit parity without a real spike. Do **not** rewrite journal into `EntityFormScreen` unless Close/title/mode/keyboard regressions force it.
- **Unblocks:** nothing in Phase 2. **Does not unblock:** journal→EntityFormScreen migration.

---

## Phase 2 — High-impact consistency (user-visible)

**Status: done** (`749e98d5a` … `cefd313c1`, plus D1 entry `9393604a6`).

| # | Work | Notes |
|---|---|---|
| 2.1 | **Hub premature empty** | **Done.** Gate empty until insights first emit (`useInsightPatterns` / Hub VM / HubView). |
| 2.2 | **Error vs empty separation** | **Done.** Journal list, Reports v2, Inbox failures → `ErrorStateView`; zero results stay `EmptyStateView`. |
| 2.3 | **Section heading convention** | **Done (convention + focused migrate).** Four roles — (1) `ScreenSectionHeader` for screen sections (optional action); (2) **`SectionLabel` for forms**; (3) `ListGroup` `header` for settings/grouped lists; (4) `DisclosureToggle` / `DetailDisclosure` for expand/collapse headers. Migrated Accounts list, Budget insights, Hub widget, Capture suggestions groups + Capture workspace sources. |
| 2.4 | **Budget edit field chrome** | **Done.** `SectionLabel` + wrap bare `FormRow` in `ListGroup variant="plain"`; removed unused `FormSectionGroup`. |
| 2.5 | **List inset visual pass** | **Done (device evidence).** Journal/Budget/Planned lists → `listBottomInset.tab` (no list FAB; center Add is tab chrome). Planned summary dropped extra border to match Budget. Selection last row clears dock. |
| 2.6 | **Create/edit title casing** | **Done.** One pattern in copy (“New X” / “Edit X”): Account/Category/Budget/Planned/Journal/Rule; no Account detail title invent. |

**D3 closed = contextual-only:** no `ContextualAddMenu` follow-up.  
**D1 closed = Money overview primary:** drawer Explore → `/reports-v2` landed; deep merge later (Phase 3 Reports slice).

---

## Phase 3 — Feature slices (on-touch / scheduled cleanup)

One feature area per PR (or pair). Extract only around stable seams (row render, load state, form VM).

| Slice | Priority candidates | Preserve |
|---|---|---|
| **Capture / inbox** | **Done.** Shared `HistoricalPatternRow` via `ListRow`; `ExpandableReviewRow`; sort/filter module (`captureSuggestionSort`). Skipped AppTabs — `AppSegmentedControl` already fits Review/Saved + counts. | Filters, paging, actions |
| **Account hierarchy / matchers** | Skipped — section headings already migrated in 2.3; no fresh roughness found this pass | Drag, reparent, pending save |
| **Budget / Planned** | **Partial.** Shared `titleAmountFit`; list insets in 2.5. Skipped chart-token deep pass / row-button rewrite (cards already PressScale). | Selection, confirm paths |
| **Journal** | **Done.** Search Clear-scope → ghost `AppButton`; chip `gap`; merge/bulk → `LoadingView` | Composer behavior |
| **Reports (post-D1)** | **Done (polish only).** v2 breakdown → `ListRow`; quality banner → `NoticeBanner`; shared `reportChartWidth`. No v1/v2 merge. | Drilldowns |
| **Audit** | **Done.** Export → `AppButton` loading; empty → `EmptyStateView` icon; stop theme prop-drill in changes/diff. Revert dialog preserved. | Revert dialog |
| **Dashboard / Hub / Insights** | Skipped — Hub load already Phase 2.1 | Insight dismiss |
| **Settings / privacy** | Skipped | Confirm flows |
| **Setup / first-run** | Skipped | Restore/recovery exits |

---

## Phase 4 — Shared design-system backlog (opportunistic)

Do when a caller forces it, or as small “hygiene” PRs — not a big-bang.

1. Document section/state primitive usage (CLAUDE / UI conventions)
2. Modal footer/button-weight audit across Info/Confirm/Bulk/Form sheets
3. Input surface: leave AppInput vs AppInputField split until a merge has a caller; tame CalculatorAmountInput props when next touched
4. Token pass: shadows→Shape.elevation, ZIndex, durations; AppTabs 10pt badge
5. Dead exports/unused segmented/Skeleton props — recheck then prune
6. Ownership moves (core↔shared, feature-only shared files) only with a concrete import graph win
7. Prop-naming / `themeMode` comment — lowest priority

---

## Phase 5 — Verify-only (runtime / device)

Track as a checklist; don’t “fix” without evidence.

- [x] Touch targets: ListRow 40 / Button sm 32 vs 44 — effective hitSlop on dense rows + date controls — **verified iPad**: date prev/next frames 40×40, tappable; no global size change
- [x] Custom pressables: roles/labels/states (date menu, sheets, calendar cells, account picker) — **verified iPad**: date stepper + date menu labeled; Account detail More/Search/Privacy labeled
- [x] Hub empty flash — **verified iPad** (insight present, no premature empty)
- [x] List bottom insets + selection-mode last row — verified iPhone 17 (Accounts last Equity row + selection dock gap; Budget/Planned tab inset aligned)
- [x] Inbox bottom padding / hideFooter — **verified iPad**: empty state with hideFooter; content not under chrome
- [x] Keyboard dismiss / press scale / ripple — decide per control role, don’t globalize blindly — **verified**: search dismiss works; keep PressScale per-control
- [x] Legacy routes reachability before prune — **N/A / closed**: no legacy deep links to preserve; not a Phase 5 gate (compatibility route files can stay or go with normal cleanup, not blocked on openurl)
- [x] Crowded detail headers before forcing one Edit/overflow rule — **verified Account detail**: Back + Search + More + Privacy (40pt); keep DetailHeaderMenuActions; no single-rule force

---

## Suggested execution order

```
Done:        Phase 0–2, D1 entry, Phase 3 (Journal/Capture/Reports polish/Audit), Phase 5

Next:        Phase 4 opportunistic hygiene when a caller forces it;
             Setup name-validation / Settings-privacy only on-touch
```

### PR rules

- Prefer vertical slices over “fix all loading states”
- No drive-by file splits by line count
- Don’t reopen checklist §8 closed items
- Every consistency PR cites the checklist item it closes

---

## Out of scope (explicit)

- Rewriting journal composer into EntityFormScreen without a spike proving parity
- Merging Reports v1/v2 implementation before D1
- Global AppButton/ListRow dimension change without Phase 5 evidence
- ~~Deleting compatibility routes without reachability proof~~ — dropped; no legacy deep links to protect
