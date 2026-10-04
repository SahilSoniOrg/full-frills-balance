# Commitments density review — October 4, 2026

This pass addresses the oversized layout shown in the user's daily-simulator captures. The hierarchy and financial behavior remain intact; the changes use the app's existing spacing and typography tokens.

- The segmented control is 44pt tall, with tighter surrounding gaps.
- Budget names use body type. Summary padding, card gaps and detail section spacing are smaller; the chart plot remains 156pt tall.
- Planned rows put name and amount above a wider account-flow row. Normal date tiles are 44pt wide; large text gets 64pt tiles. Long chip names truncate visually and remain complete in the row's accessible label.
- Overdue Record stays a separate 44pt target beside the late label at normal text sizes. Large text places it below the row.
- Detail Record, Skip and Resume use 44pt minimum heights and smaller vertical padding; native text can enlarge them.
- Saved and projected Coming up dates share equal-width tiles. Saved tiles fill their touchable containers without the shared button's extra padding. An edited saved occurrence retains its own precise amount.

## Verification

Final `bun run verify` passed: **478 suites / 3,022 tests**, architecture and privacy checks, both typechecks, coverage and lint. Lint has zero errors and the existing `useJournalSuggestions.ts:78` dependency warning. The new regression case checks saved/projected tile sizing and saved-journal navigation. Existing tests retain inline Record separation, busy/error handling, precision, privacy, history, paused and ended states. Whitespace checks passed. The scoped mechanical layout scan returned no findings.

## Native previews

These are real React Native components on the dedicated iPhone 17e simulator, using invented fixtures. The `long-content` fixture includes long budget/payment/account names and a mixture of saved and projected upcoming payments. The user's daily simulator and financial data were not accessed.

| Screen | Dark, 390pt | Light, 320pt, privacy | Dark, 320pt, accessibility-large |
| --- | --- | --- | --- |
| Budgets | [View](../../../output/commitments-redesign-native/density-budgets-dark-390.png) | [View](../../../output/commitments-redesign-native/density-budgets-light-320-privacy.png) | [View](../../../output/commitments-redesign-native/density-budgets-dark-320-large.png) |
| Planned | [View](../../../output/commitments-redesign-native/density-planned-dark-390.png) | [View](../../../output/commitments-redesign-native/density-planned-light-320-privacy.png) | [View](../../../output/commitments-redesign-native/density-planned-dark-320-large.png) |
| Budget detail | [View](../../../output/commitments-redesign-native/density-budget-detail-dark-390.png) | [View](../../../output/commitments-redesign-native/density-budget-detail-light-320-privacy.png) | [View](../../../output/commitments-redesign-native/density-budget-detail-dark-320-large.png) |
| Planned detail | [View](../../../output/commitments-redesign-native/density-planned-detail-dark-390.png) | [View](../../../output/commitments-redesign-native/density-planned-detail-light-320-privacy.png) | [View](../../../output/commitments-redesign-native/density-planned-detail-dark-320-large.png) |

The normal captures show compact rows, single-line account flows, clear date urgency and three aligned Coming up tiles. Privacy captures mask summary, detail and history amounts. Large text remains enabled: headings and content wrap, amounts retain precision, and detail actions stack.

These captures cover the initial viewport, not every scrolled section or live database integration. At accessibility-large, navigation titles truncate and long payment names may wrap or truncate; lower sections require scrolling. The 320pt canvas is constrained inside a 390pt simulator. Fixture actions are inert; service, hook and component tests provide the behavior verification.
