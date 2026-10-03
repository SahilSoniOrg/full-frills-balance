# Commitments redesign: independent native visual review

Reviewed October 4, 2026 against the final mockups and requirements in `docs/designs/commitments-redesign/README.md`, and the retained behavior and limits in `docs/audits/detail-page-ux-2026-10-02/README.md`.

## Verdict

**No material visual violation confirmed in the final 40-frame top-screen matrix.** The current captures preserve complete money values and currency tokens at normal 320pt width, mask visible monetary values in private mode, and keep labels and amounts legible through the captured large Dynamic Type layouts. The budget and planned-payment hierarchies follow the approved screens and stated show/hide rules.

At accessibility-large, several pages continue below the initial viewport and the fixed floating action can cover content in that viewport. This is expected for these scrollable screens, not evidence of truncation: the planned-detail 320pt accessibility-large scrolled capture reaches the end of Details and the Pause action. The 390pt normal planned-detail scrolled capture and budget-detail end capture also show lower-page content. I excluded the mislabeled `budget-detail-end-320-accessibility-large.png` from review; it shows the top of that screen and is not an end-of-list capture.

## Visual checks

- Compared all four native screens at both constrained content widths in dark/light normal and dark/light private appearances, plus dark accessibility-large at both widths.
- Checked budget summary and row amounts, cents at 320pt, currency symbols, status labels, and the amount/limit relationship. No split or missing numeric tokens were visible in final captures.
- Checked planned totals, incoming totals, group subtotals, overdue amounts, and Record controls. Rows reflow at 320pt while retaining their content and distinct Record action.
- Checked privacy captures across summary cards, rows, charts, category totals, edited payment amounts, and payment history. Monetary values are masked; names, dates, statuses, and non-monetary counts remain visible.
- Checked accessibility-large line wrapping and the visible payment, Record, Skip, and floating actions. Text wraps across lines rather than breaking into individual letters; long navigation titles truncate as documented in the verification notes.
- Compared against the approved mockup hierarchy and the brief’s visibility rules. Screens use populated chart, month-strip, category, and history fixtures as documented by the harness.

## Limits

These images establish visual composition only. The harness uses typed fixture view models; callbacks are inert, and the Commitments tab shell is approximated. They do not prove database writes, navigation behavior, accessibility labels/roles, or minimum hit-target sizes. Width 320pt is a centered content-width constraint inside the 390pt iPhone 17e simulator, not a separate physical-device capture. Cropping below the viewport is not counted as clipping when the page scrolls. No source changes or simulator interaction were performed for this review.

## Exact final top-frame images reviewed

The following 40 unmodified images form the review matrix:

```text
budgets-dark-390-normal.png
budgets-dark-320-normal.png
budgets-light-390-normal.png
budgets-light-320-normal.png
budgets-dark-390-privacy.png
budgets-dark-320-privacy.png
budgets-light-390-privacy.png
budgets-light-320-privacy.png
budgets-dark-390-accessibility-large.png
budgets-dark-320-accessibility-large.png
planned-dark-390-normal.png
planned-dark-320-normal.png
planned-light-390-normal.png
planned-light-320-normal.png
planned-dark-390-privacy.png
planned-dark-320-privacy.png
planned-light-390-privacy.png
planned-light-320-privacy.png
planned-dark-390-accessibility-large.png
planned-dark-320-accessibility-large.png
budget-detail-dark-390-normal.png
budget-detail-dark-320-normal.png
budget-detail-light-390-normal.png
budget-detail-light-320-normal.png
budget-detail-dark-390-privacy.png
budget-detail-dark-320-privacy.png
budget-detail-light-390-privacy.png
budget-detail-light-320-privacy.png
budget-detail-dark-390-accessibility-large.png
budget-detail-dark-320-accessibility-large.png
planned-detail-dark-390-normal.png
planned-detail-dark-320-normal.png
planned-detail-light-390-normal.png
planned-detail-light-320-normal.png
planned-detail-dark-390-privacy.png
planned-detail-dark-320-privacy.png
planned-detail-light-390-privacy.png
planned-detail-light-320-privacy.png
planned-detail-dark-390-accessibility-large.png
planned-detail-dark-320-accessibility-large.png
```

Additional valid scrolled captures reviewed: `planned-detail-scrolled-history-details-320-accessibility-large.png`, `planned-detail-scrolled-history-details-390-normal.png`, and `budget-detail-end-390-normal.png`. All reviewed source images are in `output/commitments-redesign-native/` and remain unmodified.

## Final edge and scrolled-frame addendum

I opened the current image files directly for this pass; no prior contact sheet was reused. No material visual violation was confirmed in the five edge frames or the supplementary frames available below.

- `edge-budget-detail-nothing-spent.png`: full ₹24,000.00 remaining and limit, an empty bar with today marker, “Nothing spent yet,” and no pace comparison text.
- `edge-budget-detail-missing-fx.png`: complete approximate amount, Incomplete badge, warning bar and “2 USD entries without a rate · tap to fix.” Per-day allocation is replaced with Days. The screenshot establishes the visible repair affordance, not its action.
- `edge-budget-detail-over-limit.png`: “Over the limit,” “By 5%,” full red ₹680.00 overspend, “past ₹14,000.00,” and a striped overspend segment. Stat values retain their currency and cents.
- `edge-planned-detail-paused.png`: Since date, muted Paused badge/amount/cadence, resuming explanation and full-width Resume action. Coming up and settlement buttons are absent.
- `edge-planned-detail-ended.png`: last-payment month, Ended badge and lifetime total/count; no Coming up or settlement buttons.
- `budget-detail-end-390-normal.png`: the final Activity row, account flow and complete amount sit above the Expense action.
- `budget-detail-end-320-accessibility-large.png`: the current file has a 03:45 screenshot clock and 03:45:31 file timestamp. It shows the bottom Activity row, complete ₹5,200.00 amount, account labels/time and clear space above the Expense action. It is a genuine lower-page frame, replacing the earlier top frame excluded above; that exclusion does not apply to this version.
- `planned-detail-coming-up-320-accessibility-large.png`: Record/Skip labels remain readable after scrolling, and all three future dates and weekdays fit in stacked tiles. No usual-amount repetition appears in those tiles. The top of Record and the following History heading intersect the viewport boundary at this scroll position; this is viewport cropping.
- `planned-detail-scrolled-history-details-390-normal.png`: edited, skipped and reversed history rows, full amounts, the schedule label/value list, full Note and Pause action remain readable.

### Exact supplementary file fidelity and remaining limits

The audit directory contains the five edge files and four supplementary files named above. The requested `planned-detail-scrolled-history-details-320-accessibility-large.png` is absent from both the audit directory and the native output directory at this pass. The available original is now named `output/commitments-redesign-native/planned-detail-scrolled-details-only-320-accessibility-large.png`; I opened that file directly. It shows Started, Ends, the full Note and Pause action, with clear bottom space. It does **not** show large-type History rows, so it provides no additional evidence for their layout. This renamed file is outside the copied audit package; I did not copy or rename it because ownership is restricted to this report.

These edge captures are normal-size dark frames, not an edge-state privacy/light/large-type matrix. Their show/hide composition and displayed amounts are checked; edge-state privacy, dynamic text extremes, interaction outcomes and the timing of state transitions remain outside this added evidence. The existing fixture/callback and constrained-canvas limitations still apply. All findings in this addendum are my own; no secondary delegation was used.
