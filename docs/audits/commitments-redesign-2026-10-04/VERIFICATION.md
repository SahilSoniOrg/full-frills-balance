# Commitments redesign final verification

Verified 2026-10-04 03:41 IST against `8dcba1345dc0d75520019d144488bf365a620160` (`codex/commitments-redesign-layout`). HEAD was unchanged during verification.

## Result

`bun run verify` exited 0. The exact run was captured at `/tmp/commitments-luna-final-verify.log`.

- Architecture checks, privacy-policy check, E2E TypeScript check, and app TypeScript check passed.
- Jest coverage: 477/477 suites and 3,010/3,010 tests passed; 0 snapshots. Runtime: 76.639 seconds. Overall coverage: 64.23% statements, 55.41% branches, 63.99% functions, 65.63% lines.
- Expo lint completed with 0 errors and 1 warning: the existing `react-hooks/exhaustive-deps` warning in `src/features/journal/hooks/useJournalSuggestions.ts:78`.
- `git diff --check` passed. The full verify run reported no TypeScript or fixture compilation failure.

## October 2 preservation checks

Focused source tests cover the required behaviors:

- Saved occurrence amount/currency: `keeps edited saved amounts and deduplicates cursor dates`; `confirms the edited occurrence amount and currency instead of the rule amount`; and the list recording test `posts the displayed saved journal occurrence with its own date and currency-specific saved row`.
- Confirmation, write locking, failures, retry, and staying on the detail page: `locks concurrent actions and keeps the page open after recording`; `surfaces a settlement failure and permits retry instead of silently leaving the user stuck`; and the detail view tests for disabled actions while settling and visible retryable failures.
- Paused projection: `honors finite schedules and hides projections while paused`, with a separate list test for paused schedules and saved pending occurrences.
- Currency totals and exclusions: `summarizes more than one history page, preserves currencies, and excludes skipped/reversed payments`; the service summary asserts currencies separately and excludes skipped, reversed, reversal-linked, pending, and paused rows.
- Budget period and journal-date behavior: `uses the journal date when legacy transaction dates belong to another period`; budget detail tests separately assert leaf-account/status query scope, shared current/previous-period chart queries, and journal-date FX/refund handling.

Two verification boundaries remain: the budget test for divergent transaction and journal dates proves period usage, while separate detail-hook tests prove Activity query scope; no single assertion compares both outputs for that same fixture. Currency exclusion and per-currency totals are asserted at the history aggregation service, rather than through a rendered history screen test.

## Evidence limits

The native captures are fixture-driven composition and layout evidence. The harness does not mount the Commitments database hooks, and its action/navigation callbacks are inert; these captures do not establish end-to-end database or write-action behavior. The focused regression tests above cover those behaviors at their service, hook, and component boundaries.
