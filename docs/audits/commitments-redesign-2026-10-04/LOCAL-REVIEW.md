# Commitments redesign local review

Review the finished redesign on the single local branch `codex/commitments-redesign`. Delivery is local: no push or pull requests are requested.

The verified application commit is `8dcba1345dc0d75520019d144488bf365a620160`. The native audit and verification evidence are recorded in commit `38c195dd`. These identify the reviewed application and its evidence; subsequent documentation changes do not replace the verified application commit.

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

[`VERIFICATION.md`](VERIFICATION.md) records `bun run verify` exiting 0 on October 4, 2026 at the application commit above: 477/477 suites and 3,010/3,010 tests passed, along with architecture/privacy checks, app and E2E typechecks, coverage and lint. Lint reported zero errors and the existing dependency warning in `useJournalSuggestions.ts:78`. The captured run is `/tmp/commitments-luna-final-verify.log`. This document records that completed run; verification was not rerun for the local delivery update.

The earlier data checkpoint passed 468 suites / 2,961 tests. The verification record retains the October 2 behavior checks and their service, hook and component coverage boundaries.

## Local screenshot gallery

The audit directory contains 53 files: 49 native PNGs and four Markdown documents. The images comprise [40 matrix captures](README.md#capture-matrix), [five edge-state captures and four scrolled captures](README.md#edge-state-and-scrolled-evidence). Every screenshot link is local.

| Screen | Dark, 390pt | Light, 390pt | Privacy, 320pt | Large type, 320pt |
| --- | --- | --- | --- | --- |
| Budgets | [View](budgets-dark-390-normal.png) | [View](budgets-light-390-normal.png) | [View](budgets-dark-320-privacy.png) | [View](budgets-dark-320-accessibility-large.png) |
| Planned | [View](planned-dark-390-normal.png) | [View](planned-light-390-normal.png) | [View](planned-dark-320-privacy.png) | [View](planned-dark-320-accessibility-large.png) |
| Budget detail | [View](budget-detail-dark-390-normal.png) | [View](budget-detail-light-390-normal.png) | [View](budget-detail-dark-320-privacy.png) | [View](budget-detail-dark-320-accessibility-large.png) |
| Planned detail | [View](planned-detail-dark-390-normal.png) | [View](planned-detail-light-390-normal.png) | [View](planned-detail-dark-320-privacy.png) | [View](planned-detail-dark-320-accessibility-large.png) |

## Evidence limits

The screenshots show actual native components with invented typed fixtures. The Commitments database hooks are not mounted and action/navigation callbacks are inert. The captures establish composition and native text layout; service, hook and component tests supply the recorded behavior checks. The user's financial data and daily simulator were not touched.

The 320pt canvas is constrained inside the same 390pt simulator, rather than a separate physical device. Long navigation titles still truncate at accessibility-large. Native end-scroll coverage is not claimed for the two list tabs. The combined Planned Detail History-to-Details viewport at 320pt accessibility-large was not validated and is excluded from the copied evidence. The [audit README](README.md#native-evidence) preserves the exact capture coverage and limitations.
