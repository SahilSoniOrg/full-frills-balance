# App design improvement loop

Use this process to improve one user task at a time and tell whether the change helped. Do not treat an agent review, a subjective score, or a prettier screenshot as proof of better usability.

The repository already has strong examples of matched visual evidence and explicit acceptance criteria in the [design density plan](../plans/design-density-cleanup-2026-10-02.md) and [Commitments verification record](../audits/commitments-redesign-2026-10-04/VERIFICATION.md). This loop makes that evidence repeatable across future design work.

## One climb

1. **Choose a user task with evidence.** Name what the person is trying to do, where they get stuck, and the source: a user report, observed task, reproducible UI state, or code path. Source inspection alone creates a hypothesis, not a confirmed usability problem.
2. **State one falsifiable hypothesis.** Describe the smallest change expected to help, why it should help, and what observation would prove it wrong.
3. **Set one primary measure and guardrails.** Prefer task completion, first-attempt accuracy, time, errors, or number of steps. Set a concrete target before editing. Keep separate pass/fail guardrails for financial meaning, privacy, accessibility, state continuity, and supported layouts. Do not collapse tradeoffs into an averaged score.
4. **Capture the baseline.** Save the current flow and screenshots or accessibility tree. Record commit, platform/device and viewport, theme, locale, text scale, data fixture, privacy state, and starting navigation/scroll position. Use the same conditions after the change.
5. **Make one bounded change.** Keep its scope small enough that a better result can be attributed to that change. If the evidence points to separate problems, split them into separate climbs.
6. **Repeat the measure and guardrails.** Use the same task and fixture. Component or accessibility checks can prove a contract; matched screenshots can prove a visual difference. Neither alone proves a person can complete the task more easily. Use a short task walkthrough when comprehension or discoverability is the claim.
7. **Keep, revise, or revert.** Keep only when the primary measure meets its target and every guardrail passes. If the result is flat, worse, or unmeasured, do not call it an improvement. Record the limit and either revise the hypothesis or choose another candidate.
8. **Record the result.** Link the change, before/after evidence, checks performed, known gaps, and decision. Start the next climb from the accepted result.

## App-specific guardrails

- **Money and accounting:** the same books produce the same values, dates, currencies, and balance status. Approximate, stale, unavailable, unbalanced, and needs-review states remain distinct and visible.
- **Privacy:** masked amounts stay masked in visible text, chart summaries, accessibility labels, notifications, and screenshots used for review.
- **Accessibility:** controls have an accessible name, role, and state; charts have a useful non-gesture equivalent; important amounts remain legible at supported text scales; touch targets remain at least 44 logical pixels where the existing platform contract requires it.
- **State:** resizing or changing presentation preserves the active workplace, selected record, relevant filters, scroll position, and unfinished drafts unless the task explicitly calls for a reset.
- **Discoverability:** every destination and essential action works through visible controls. Gestures may accelerate a task but cannot be its only route.
- **Truthful states:** loading, empty, stale, unavailable, partial, and error states do not impersonate valid zero values or success.

## Evidence levels

Label what the evidence actually establishes:

- **Source evidence:** confirms a code path or copy claim; it does not establish what the running interface feels like.
- **Component/automation evidence:** confirms a specific behavior, state, label, or calculation contract.
- **Matched visual evidence:** confirms presentation changes under recorded conditions; it does not establish task success.
- **Task evidence:** a person in the target audience completes the same task before and after. This is the strongest evidence for comprehension, speed, and discoverability claims.

Do not upgrade a claim beyond its evidence level. If task evidence is unavailable, say which proxy was used and what remains unverified.

## Candidate record

Copy this block for each climb:

```text
ID / status:
User task:
Observed problem and evidence:
Hypothesis:
Primary measure and target:
Baseline conditions and artifact:
Guardrails:
Smallest change:
After artifact and result:
Decision: keep / revise / revert
Evidence level and remaining uncertainty:
```

## Initial queue

1. **Safe to Spend warning accuracy (first climb).** The UI says “Some balances not converted,” but the warning flag can also represent unvalued journal, budget, or projected amounts. Measure whether the warning accurately describes the incomplete estimate for both identified starting-balance failures and cases with no itemized balance. Preserve the approximate marker, the one-tap details action, and the calculation.
2. **Chart access.** Core line charts expose touch interaction without a text equivalent. Verify VoiceOver/TalkBack can understand the trend and inspect useful values without scrubbing.
3. **Adaptive account task.** Compare account lookup/review on a compact window and a wide window. Test whether keeping the account list beside the selected account reduces backtracking without losing selection, privacy, or scroll state.
4. **Inbox recovery.** Replace implementation-style failure labels with a clear problem and next action; verify raw SMS content remains protected by the intended privacy behavior.
5. **Dashboard focus and large text.** Review whether the forecast and planned payments push recent activity too far down, and whether account balances remain readable at large system text sizes.

## Climb 01 — Safe to Spend warning accuracy

**Status:** complete; component-verified.

**User task:** understand whether the Safe to Spend estimate is complete enough to use.

**Baseline evidence:** `SafeToSpendCard` shows `Some balances not converted` whenever `hasUnvaluedEntries` is true. That flag also covers unvalued simulation amounts beyond starting account balances. A reproducible card state can set `hasUnvaluedEntries: true` while providing no `unvaluedStartingBalances`; the warning still makes the narrower balance-only claim.

**Hypothesis:** a truthful, scope-neutral warning will prevent the user from mistaking every incomplete estimate for a missing starting-balance conversion, while preserving the existing one-tap detail route.

**Primary measure:** in the no-itemized-balance state, the warning describes an incomplete estimate without claiming that a balance was converted or omitted.

**Guardrails:** the Safe to Spend amount remains marked approximate; the review-details control and accessible hint remain available; stale/unavailable forecast behavior and financial calculations do not change.

**After evidence:** the accessible warning now reads “Some amounts could not be included. This estimate may be incomplete.” The “Review details” action remains part of its accessible name. The existing component test now exercises the incomplete state with no itemized starting balance, the case that exposed the old inaccurate wording.

**Verification:** `SafeToSpendCardAvailability.test.tsx` passed: 1 suite, 6 tests. This confirms the message and recovery action for the reproducible card state; it does not prove users understand the message better. No calculation, stale/unavailable state, or visual layout changed.

**Decision:** keep the copy correction. Before: the warning claimed balances were not converted even when no starting-balance detail existed. After: it truthfully says the estimate may be incomplete. Remaining uncertainty is comprehension, which requires a short task walkthrough.

## Climb 02 — line-chart text equivalent

**Status:** component-verified; screen-reader task evidence pending.

**User task:** understand the trend and key values without touching or scrubbing the chart.

**Baseline evidence:** parallel source review found that the shared `LineChart` exposed gesture interaction but no accessible text summary. This was a source finding, not an observed failure in a screen-reader task.

**Hypothesis:** a screen-reader label with the first, lowest, and last dated values will provide a useful non-gesture equivalent while keeping money masked through the existing privacy-aware formatters.

**Acceptance target:** every production `LineChart` call supplies a summary; the shared chart exposes it as an accessible image label in both data and empty states; summary generation handles unsorted, single-point, and empty data; money values use the existing privacy-aware formatter.

**After evidence:** `LineChart` now requires `accessibilitySummary`. The summary helper sorts points by date and reports the first, low, and last values; all five production call sites provide summaries, and financial call sites format values through `useMoneyFormat` or `useStsMoneyFormat`.

**Verification:** component and helper tests cover the accessible role/name in empty and populated charts, chronological start/low/end values, additional series, single point, and empty data. The combined focused run passed 6 suites and 25 tests. The mechanical design detector returned no findings. Repository-wide TypeScript checking reports two errors in unchanged files: `ReportsV2Breakdown.test.tsx` and `src/utils/navigation.ts`.

**Decision:** keep the implementation as an accessibility-contract improvement. It does not yet prove that people can understand the charts or inspect every point with VoiceOver or TalkBack. Do a short device walkthrough before claiming a user-level improvement.

## Climb 03 — dashboard alert counts

**Status:** component-verified; screen-reader task evidence pending.

**User task:** know whether transaction reviews or notifications are waiting before opening those sections.

**Baseline evidence:** the dashboard showed visual dots, while the button names did not announce the counts. This came from source review; no screen-reader walkthrough was recorded.

**Hypothesis:** adding the current count to each accessible button name will communicate pending work at the dashboard, while zero-count names stay concise.

**Acceptance target:** positive SMS and notification counts are included in their respective accessible names; zero counts omit count language; button activation still reaches its existing action.

**After evidence:** transaction inbox and notification button names now include their counts when nonzero. The SMS label uses singular/plural wording. Tests cover both positive counts, concise zero-count names, and inbox activation.

**Decision:** keep the accessible-name change. Actual announcement quality and triage speed remain unmeasured on VoiceOver/TalkBack.

## Climb 04 — inbox processing labels

**Status:** component-verified; inbox comprehension and recovery task evidence pending.

**User task:** understand why an imported transaction is in its current state and what can be done next.

**Baseline evidence:** the status badge exposed enum spelling with underscores replaced by spaces, producing implementation-style text such as “parse failed.” For SMS parse failures, the existing `Edit & Re-parse` action is available.

**Hypothesis:** explicit user-facing status labels will explain common states without changing import behavior, and an unknown future state will not expose a raw enum value.

**Acceptance target:** all six current statuses have clear labels; unknown statuses use a safe fallback; the parse-failure card shows both its explanation and the existing recovery action.

**After evidence:** the card uses a typed status-label map, with “Couldn't read transaction details” for parse failures and “Status unavailable” for unknown states. Import, dismissal, duplicate, and auto-post behavior did not change.

**Verification:** helper tests cover all six statuses and the unknown-state fallback. The card test checks the parse-failure explanation, `Edit & Re-parse`, and absence of the raw enum label. Raw-message privacy behavior was outside this climb and was not reviewed here.

**Decision:** keep the clearer labels. Whether people can choose the right recovery action remains unmeasured in a task walkthrough.

## Next climb

The strongest remaining candidate is account lookup and review across compact and wide windows. Capture matched baseline layouts and measure backtracking before changing the layout; preserve the selected account, scroll state, and privacy masking. Account balance legibility at large text sizes is another candidate for a device-based accessibility check.

The three changes above meet their component-level contracts. None has task evidence yet, so the log records them as verified interface properties, not proven gains in comprehension or speed.
