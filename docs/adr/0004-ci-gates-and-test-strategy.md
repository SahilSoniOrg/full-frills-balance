# ADR-0004: Fast checks gate PRs; browser E2E runs on a schedule

- **Status:** Accepted
- **Date:** 2026-07-25

## Context

The only CI workflow was `playwright.yml`, running web E2E tests on every push.

## Problem

Measured on 2026-07-25:

- The workflow had failed **147 times**; the last success was **2026-02-04**.
- It failed *before running any test* — `expo export -p web` exits 1 (`expo-font`
  server context error), so Playwright never started.
- Jest (668 tests, ~10s), `tsc --noEmit` (~6s) and ESLint (~25s) ran in **no** CI
  job at all. `.husky/pre-commit` ran only `lint-staged`.
- Consequently two tests were failing on `main` and nobody was told; and an
  `it.only` had silently disabled two simulation tests since commit `4c1eae98`,
  one of which was genuinely broken.

A permanently-red check is indistinguishable from no check, and this one had
trained the maintainer to ignore it for five months.

## Decision

Split the signals by cost and reliability:

1. **`ci.yml` gates every PR**: `tsc --noEmit`, `jest --ci`, `expo lint`. Total
   well under two minutes. Installs with `--ignore-scripts` so the macOS-only
   litert-lm framework download is skipped on Linux.
2. **`playwright.yml` becomes scheduled/manual** and does not gate PRs.
3. `main` must be green. A failing test is fixed or explicitly skipped with a
   linked reason — never left red.
4. `it.only` / `describe.only` are treated as defects.

## Alternatives considered

- **Fix the web export and keep E2E as the gate.** Worth doing eventually, but
  it does not address the absence of unit/type/lint gates, and web E2E is
  structurally unrepresentative: it runs the LokiJS adapter instead of native
  SQLite, shims MMKV, and cannot exercise SMS ingestion or widgets at all.
- **Pre-commit hook running everything.** Too slow per commit; pushes people to
  `--no-verify`. Typecheck belongs in pre-push at most.

## Trade-offs

- **Benefit:** a real ~90-second gate; regressions in money code get caught.
- **Cost:** web regressions are found a day late rather than per-PR.

## Consequences

- Coverage is currently 35% statements / 27% branches, and the journal
  post/revert/recover path is 0% covered. The gate prevents *new* rot but does
  not retroactively cover the write path.
- Per-path `coverageThreshold` ratchets should be added once
  `services/accounting`, `services/ledger` and `utils/money` are covered — a
  global percentage target would just encourage testing easy code.

## Migration strategy

1. Add `ci.yml`; add `typecheck` / `test:ci` / `verify` scripts. **Done.**
2. Make the suite green: fix the stale SMS mock, remove `it.only`, repair the
   revealed assertion. **Done.**
3. Convert `playwright.yml` to `schedule` + `workflow_dispatch`.
4. Add a migration test harness (v1 → v28 against fixtures) — the single largest
   uncovered risk, because a bad migration is unrecoverable user data loss.
5. Add integration tests for journal post/revert/recover using the real in-memory
   LokiJS database already wired up in `jest.setup.js`.
