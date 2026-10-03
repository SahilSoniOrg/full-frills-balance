# Commitments redesign verification

October 4, 2026. Implements the approved brief in `docs/designs/commitments-redesign/README.md` and its four screen mockups and edge-state board. The layout follows the hierarchy rather than invented mockup pixel values.

## Local PR stack

| Change                                     | Branch                                      | Base                                       |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------ |
| Data projections and shared budget status  | `codex/commitments-redesign-data`           | `main`                                     |
| Budgets tab                                | `codex/commitments-redesign-budgets`        | `codex/commitments-redesign-data`          |
| Planned tab                                | `codex/commitments-redesign-planned`        | `codex/commitments-redesign-budgets`       |
| Budget detail                              | `codex/commitments-redesign-budget-detail`  | `codex/commitments-redesign-planned`       |
| Planned-payment detail and visual evidence | `codex/commitments-redesign-planned-detail` | `codex/commitments-redesign-budget-detail` |

Each checkpoint typechecks independently. Data was verified before the UI work: 468 suites / 2,961 tests. Final source verification: `bun run verify` passes 477 suites / 3,010 tests, coverage, architecture/privacy checks, application and E2E typechecks, and lint. Lint reports only the existing dependency warning in `useJournalSuggestions.ts`. Scoped lint and whitespace checks pass.

The [draft descriptions](pr-drafts/) are ready for publication. Nothing has been pushed or published: the user's AGENTS instructions require asking before external actions, and approval is pending.

## Data and behaviour checks

- Budgets share ordered Over / Near limit / Ahead of pace / On pace rules. Named thresholds are 80% and ten percentage points. Summary totals include only one-month budgets in the workplace currency; other currencies and cadences are counted separately. Different reset dates hide the shared period and marker.
- Budget totals, category shares, current chart and previous chart use journal dates, posted-equivalent statuses, resolved leaf categories and historical FX conversion. The current-period comparison includes the full same-offset calendar day and clamps shorter previous periods. Previous failures or incomplete conversions hide that comparison. Refunds can take the chart below zero.
- Planned grouping preserves each saved pending occurrence and its own amount/currency. Projections use the recurrence engine, finite boundaries and calendar refresh. Paused schedules do not project; completed schedules retain outstanding entries. Unknown directions are excluded from totals. Incoming and outgoing totals remain separate.
- Inline overdue Record uses the existing service, saved amount/currency, busy/error state and duplicate-submit lock. Detail Record/Skip keep confirmations, concurrency protection, failures and stay-open behaviour.
- Budget Activity retains the shared journal cards, day grouping, selection and pagination. Category toggles affect Activity only; composer prefill uses the selected or sole category.
- Planned history retains pagination, long press, selection and sharing. Recorded totals remain grouped by currency and exclude skipped/reversed entries. Different-currency rows show the original rule currency without an FX difference. Coming-up dates omit the hero occurrence.
- Paused-since dates come only from audited status transitions. Finite remaining counts are hidden when they cannot be calculated exactly. Ended schedules with outstanding entries retain their settlement actions.
- Money and accessible monetary labels remain privacy-aware. The overflow menu waits for native iOS dismissal before invoking navigation or confirmation; regression tests verify ordering and one-time invocation.

## Native evidence

Captured on a dedicated iPhone 17e simulator, iOS 26.5, with the actual React Native components and Deep Space's loaded Serif & Sans fonts. The 390pt and 320pt canvases are constrained inside the same 390pt simulator; 320pt is a content-width test, not a separate physical-device model. `large` is the normal native text category, and `accessibility-large` is the larger Dynamic Type category.

The harness supplies invented typed view models, real chart/category/history fixtures, the actual shared journal cards, screen chrome, account labels, privacy controls and floating actions. Planned list data comes from `buildPlannedPaymentListPresentation`; budget rows and summary use production sort/summary helpers. Budget Activity rows use `mapJournalToTimelineItem` and the production day-net grouping options, with newest-first Oct 3 and Oct 2 groups. The Commitments outer tab shell is composed for the harness rather than mounting its database hooks. Action/navigation callbacks are inert. These captures establish composition and native text layout, not end-to-end database or write-action execution; the source regression suite covers those behaviours. The user's daily simulator and financial data were not touched.

Visual comparison follows the approved hierarchy: summaries before compact rows; left/over amounts, shared account appearances and pace bars; grouped Planned obligations with their own Record controls; open budget chart/category sections and one Setup row; payment actions, future dates, history and schedule details. Dark/light privacy captures mask monetary values. At accessibility-large, Planned payment actions and future-occurrence tiles stack full-width; the three future tiles retain complete weekday names. The large 320pt navigation title still truncates to `Strea…`; long navigation titles are a known visual limitation.

The native pass found and corrected split currency tokens, normal-size 320pt budget-stat decimals, overlapping month-strip captions, an overflowing payment urgency badge, and payment labels breaking into letters. The refreshed 320pt normal budget-detail capture retains all digits in `₹14,680.00` and `₹19,240.00`. Bottom-scroll checks reached 100% on Budget Detail at 390pt normal and 320pt accessibility-large; the final Activity row is fully above the Expense FAB in both. Planned Detail's 390pt normal scrolled frame shows its recorded, skipped, and reversed history rows followed by Details. At 320pt accessibility-large, the Coming Up tiles were verified in a separate scrolled frame; a single frame showing all History rows and Details together was not verified and is excluded from this evidence package.

## Capture matrix

Each link is an unmodified native screenshot. The final image inventory is below.

| Screen         | Dark 390                                   | Dark 320                                   | Light 390                                   | Light 320                                   | Dark private 390                            | Dark private 320                            | Light private 390                            | Light private 320                            | Large type 390                                          | Large type 320                                          |
| -------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------------------- | -------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Budgets        | [View](budgets-dark-390-normal.png)        | [View](budgets-dark-320-normal.png)        | [View](budgets-light-390-normal.png)        | [View](budgets-light-320-normal.png)        | [View](budgets-dark-390-privacy.png)        | [View](budgets-dark-320-privacy.png)        | [View](budgets-light-390-privacy.png)        | [View](budgets-light-320-privacy.png)        | [View](budgets-dark-390-accessibility-large.png)        | [View](budgets-dark-320-accessibility-large.png)        |
| Planned        | [View](planned-dark-390-normal.png)        | [View](planned-dark-320-normal.png)        | [View](planned-light-390-normal.png)        | [View](planned-light-320-normal.png)        | [View](planned-dark-390-privacy.png)        | [View](planned-dark-320-privacy.png)        | [View](planned-light-390-privacy.png)        | [View](planned-light-320-privacy.png)        | [View](planned-dark-390-accessibility-large.png)        | [View](planned-dark-320-accessibility-large.png)        |
| Budget detail  | [View](budget-detail-dark-390-normal.png)  | [View](budget-detail-dark-320-normal.png)  | [View](budget-detail-light-390-normal.png)  | [View](budget-detail-light-320-normal.png)  | [View](budget-detail-dark-390-privacy.png)  | [View](budget-detail-dark-320-privacy.png)  | [View](budget-detail-light-390-privacy.png)  | [View](budget-detail-light-320-privacy.png)  | [View](budget-detail-dark-390-accessibility-large.png)  | [View](budget-detail-dark-320-accessibility-large.png)  |
| Planned detail | [View](planned-detail-dark-390-normal.png) | [View](planned-detail-dark-320-normal.png) | [View](planned-detail-light-390-normal.png) | [View](planned-detail-light-320-normal.png) | [View](planned-detail-dark-390-privacy.png) | [View](planned-detail-dark-320-privacy.png) | [View](planned-detail-light-390-privacy.png) | [View](planned-detail-light-320-privacy.png) | [View](planned-detail-dark-390-accessibility-large.png) | [View](planned-detail-dark-320-accessibility-large.png) |

## Edge-state and scrolled evidence

| State                                                                                             | Evidence                                                             |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Budget Detail: no spending                                                                        | [Screenshot](edge-budget-detail-nothing-spent.png)                   |
| Budget Detail: missing FX values                                                                  | [Screenshot](edge-budget-detail-missing-fx.png)                      |
| Budget Detail: over limit (₹14,680 spent against ₹14,000; chart uses the same three journal rows) | [Screenshot](edge-budget-detail-over-limit.png)                      |
| Planned Detail: paused                                                                            | [Screenshot](edge-planned-detail-paused.png)                         |
| Planned Detail: ended with its typed last-recorded journal                                        | [Screenshot](edge-planned-detail-ended.png)                          |
| Budget Detail: Activity at scroll end, 390pt normal                                               | [Screenshot](budget-detail-end-390-normal.png)                       |
| Budget Detail: Activity at scroll end, 320pt accessibility-large                                  | [Screenshot](budget-detail-end-320-accessibility-large.png)          |
| Planned Detail: Coming Up tiles and cadence, 320pt accessibility-large                            | [Screenshot](planned-detail-coming-up-320-accessibility-large.png)   |
| Planned Detail: History and Details, 390pt normal                                                 | [Screenshot](planned-detail-scrolled-history-details-390-normal.png) |

The 320pt accessibility-large Planned Detail bottom viewport and the History-to-Details combined viewport were not validated together; no image from that attempt is included. The audit does not claim native end-scroll coverage for the two list tabs.

The reproducible [native harness](../../../output/commitments-redesign-native/README.md) includes typed fixture source and local build/capture instructions. Only the 40 final matrix frames and the nine listed edge/scrolled screenshots are copied here; interim images remain outside the audit package.
