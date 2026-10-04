# Commitments redesign local review

Review the finished redesign on the single local branch `codex/commitments-redesign`. Delivery is local: no push or pull requests are requested.

The latest [density pass](DENSITY-REVIEW.md) tightens all four screens and fixes saved Coming up tile layout. It includes 12 native previews with long-content fixtures; final verification passed 478 suites / 3,022 tests.

The five feature commits below remain in the branch history. Commit `18aacf59` applies the requested visual polish. The full `bun run verify` passed after that commit with 478 suites and 3,021 tests; the post-polish result is recorded in [VERIFICATION.md](VERIFICATION.md). The earlier native audit and verification evidence are recorded in commit `38c195dd`.

## Preserved application history

All five application commits remain in the integration history, in this order:

| Commit | Change |
| --- | --- |
| `a80d42886fd73338867e54a663fe2b0751b582a9` | Data projections and shared budget status |
| `80c88145b121763659393a13584c9bd993eddd34` | Commitments Budgets list |
| `4fdd02657b6ee232f5dec0c42ef195e379c5ddee` | Planned commitments list |
| `fb519075a7043e3e91396b63cd546743707fb688` | Budget detail page |
| `8dcba1345dc0d75520019d144488bf365a620160` | Planned payment detail page |

## Recorded verification

[`VERIFICATION.md`](VERIFICATION.md) records both the original source verification and the post-polish `bun run verify`. The four refreshed native spot checks are available in the workspace at `output/commitments-redesign-native/polish-{budgets,planned,budget-detail,planned-detail}.png`; fixture data was used.

The earlier data checkpoint passed 468 suites / 2,961 tests. The verification record retains the October 2 behavior checks and their service, hook and component coverage boundaries.

## Local screenshot gallery

The original gallery below contains 49 native PNGs: [40 matrix captures](README.md#capture-matrix), [five edge-state captures and four scrolled captures](README.md#edge-state-and-scrolled-evidence). The latest density previews are linked separately above. Every screenshot link is local.

| Screen | Dark, 390pt | Light, 390pt | Privacy, 320pt | Large type, 320pt |
| --- | --- | --- | --- | --- |
| Budgets | [View](budgets-dark-390-normal.png) | [View](budgets-light-390-normal.png) | [View](budgets-dark-320-privacy.png) | [View](budgets-dark-320-accessibility-large.png) |
| Planned | [View](planned-dark-390-normal.png) | [View](planned-light-390-normal.png) | [View](planned-dark-320-privacy.png) | [View](planned-dark-320-accessibility-large.png) |
| Budget detail | [View](budget-detail-dark-390-normal.png) | [View](budget-detail-light-390-normal.png) | [View](budget-detail-dark-320-privacy.png) | [View](budget-detail-dark-320-accessibility-large.png) |
| Planned detail | [View](planned-detail-dark-390-normal.png) | [View](planned-detail-light-390-normal.png) | [View](planned-detail-dark-320-privacy.png) | [View](planned-detail-dark-320-accessibility-large.png) |

## Evidence limits

The screenshots show actual native components with invented typed fixtures. The Commitments database hooks are not mounted and action/navigation callbacks are inert. The captures establish composition and native text layout; service, hook and component tests supply the recorded behavior checks. The user's financial data and daily simulator were not touched.

The 320pt canvas is constrained inside the same 390pt simulator, rather than a separate physical device. Long navigation titles still truncate at accessibility-large. Native end-scroll coverage is not claimed for the two list tabs. The combined Planned Detail History-to-Details viewport at 320pt accessibility-large was not validated and is excluded from the copied evidence. The [audit README](README.md#native-evidence) preserves the exact capture coverage and limitations.
