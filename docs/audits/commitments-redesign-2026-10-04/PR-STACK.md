# Commitments redesign PR stack

Local review and publication template for the five-PR stack. No push or PR creation has been performed. The native audit copy is complete and its image targets have been verified locally. Publish after the final QA-evidence commit includes this package and the user authorizes the external action.

## Stack manifest

| # | PR title | Base branch (application commit) | Head branch | Application commit | Body file |
| --- | --- | --- | --- | --- | --- |
| 1 | `feat: add commitment redesign data projections` | `main` (`946b607f50f54bb2695509d7473cbdfc47ba7fe9`) | `codex/commitments-redesign-data` | `a80d42886fd73338867e54a663fe2b0751b582a9` | `/tmp/commitments-data-pr.md` |
| 2 | `feat: redesign Commitments budgets list` | `codex/commitments-redesign-data` (`a80d42886fd73338867e54a663fe2b0751b582a9`) | `codex/commitments-redesign-budgets` | `80c88145b121763659393a13584c9bd993eddd34` | `/tmp/commitments-budgets-pr.md` |
| 3 | `feat: redesign Planned commitments list` | `codex/commitments-redesign-budgets` (`80c88145b121763659393a13584c9bd993eddd34`) | `codex/commitments-redesign-planned` | `4fdd02657b6ee232f5dec0c42ef195e379c5ddee` | `/tmp/commitments-planned-pr.md` |
| 4 | `feat: redesign budget detail page` | `codex/commitments-redesign-planned` (`4fdd02657b6ee232f5dec0c42ef195e379c5ddee`) | `codex/commitments-redesign-budget-detail` | `fb519075a7043e3e91396b63cd546743707fb688` | `/tmp/commitments-budget-detail-pr.md` |
| 5 | `feat: redesign planned payment detail page` | `codex/commitments-redesign-budget-detail` (`fb519075a7043e3e91396b63cd546743707fb688`) | `codex/commitments-redesign-planned-detail` | `8dcba1345dc0d75520019d144488bf365a620160` | `/tmp/commitments-planned-detail-pr.md` |

The IDs in the Application commit column are the five feature commits and form a direct-parent chain. `8dcba1345dc0d75520019d144488bf365a620160` remains the planned-detail application commit and was the exact source verified. The final planned-detail branch will receive one separate QA-evidence commit after it; its publication head is resolved from the branch at publish time. The final PR will therefore contain the planned-detail application commit plus the QA-evidence commit. Do not add a predicted package/QA commit SHA here. The first four PRs each contain one application commit.

The GitHub remote is `https://github.com/SahilSoniOrg/full-frills-balance.git`. All four UI galleries and the verification-record URLs point into the final planned-detail branch. Push all five branches before creating the first PR so those URLs can resolve in every UI PR body. The capture copy is complete. Include the audit package in the final QA-evidence commit before pushing that branch; remote image links become available after the push.

## Local checks and verification proof

- `git show -s --format='%H %P %s'` confirms each application commit's full ID, direct parent and subject listed above. Direct-parent assertions refer only to these five application commits; published branch heads are resolved at publication time.
- `git diff --name-status <base>...<application-commit>` was inspected for all five pairs. The diffs contain the data layer, Budgets list, Planned list, budget detail, and planned-payment detail respectively. The final planned-detail publication head will additionally contain the separate QA-evidence commit.
- Data-checkpoint verification passed `bun run verify`: 468 suites / 2,961 tests, architecture/privacy checks, both typechecks, coverage and lint.
- Full-stack source proof: [`VERIFICATION.md`](VERIFICATION.md) records `bun run verify` exiting 0 at application commit `8dcba1345dc0d75520019d144488bf365a620160`, with 477/477 suites and 3,010/3,010 tests, architecture/privacy checks, app and E2E typechecks, coverage, and lint (one existing dependency warning in `useJournalSuggestions.ts`). The captured run is `/tmp/commitments-luna-final-verify.log`. This verification is evidence for the application commit, not a new run for this packaging pass or the later QA-evidence commit.
- Native audit inventory checked locally: 58 files, comprising 49 PNGs and 9 Markdown files. The PNGs comprise [40 matrix captures](README.md#capture-matrix), [5 edge-state captures and 4 scrolled captures](README.md#edge-state-and-scrolled-evidence). All 49 image targets in the audit README and every image target in the four UI PR galleries exist locally; PNG signatures and nonzero dimensions were checked. The copied evidence preserves the harness and coverage limits documented in the README. The final QA-evidence commit must include these assets before publication.
- Draft Markdown is in `pr-drafts/`; synchronized body files are in `/tmp/commitments-*-pr.md`. Review titles and application commits above; resolve actual publication heads from each branch at push time.

## Publication command template

Review template only; none of these commands has been run. After the final QA-evidence commit includes the complete audit copy and the user authorizes publication, first push all five branches in order, then create all five PRs in order as drafts:

```sh
git push origin codex/commitments-redesign-data
git push origin codex/commitments-redesign-budgets
git push origin codex/commitments-redesign-planned
git push origin codex/commitments-redesign-budget-detail
git push origin codex/commitments-redesign-planned-detail

gh pr create --draft --base main --head codex/commitments-redesign-data --title 'feat: add commitment redesign data projections' --body-file /tmp/commitments-data-pr.md
gh pr create --draft --base codex/commitments-redesign-data --head codex/commitments-redesign-budgets --title 'feat: redesign Commitments budgets list' --body-file /tmp/commitments-budgets-pr.md
gh pr create --draft --base codex/commitments-redesign-budgets --head codex/commitments-redesign-planned --title 'feat: redesign Planned commitments list' --body-file /tmp/commitments-planned-pr.md
gh pr create --draft --base codex/commitments-redesign-planned --head codex/commitments-redesign-budget-detail --title 'feat: redesign budget detail page' --body-file /tmp/commitments-budget-detail-pr.md
gh pr create --draft --base codex/commitments-redesign-budget-detail --head codex/commitments-redesign-planned-detail --title 'feat: redesign planned payment detail page' --body-file /tmp/commitments-planned-detail-pr.md
```
