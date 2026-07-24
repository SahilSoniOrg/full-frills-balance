# Implementation plan (post architecture audit)

**Created:** 2026-07-25  
**Canonical context:** [PROJECT_BIBLE.md](../PROJECT_BIBLE.md) · [ADRs](./adr/) · [codebase-design/AUDIT.md](./codebase-design/AUDIT.md)

This is the **active work queue**. Check items off here; keep `FUTURE_ROADMAP.md` for longer-term product ideas.

---

## How to use this doc

1. Work **top to bottom within each phase** unless a dependency says otherwise.
2. One PR per logical slice (easier review, easier revert).
3. Run `bun run verify` before merging.
4. Update `PROJECT_BIBLE.md` §9 when an item is done.

---

## Phase 0 — Land audit baseline ✅ (commit on main)

| # | Task | Status |
|---|------|--------|
| 0.1 | Green Jest suite (SMS mock, simulation heavy test) | ✅ |
| 0.2 | CI workflow: typecheck + jest + lint | ✅ |
| 0.3 | `typecheck` / `test:ci` / `verify` scripts | ✅ |
| 0.4 | `PROJECT_BIBLE.md` + ADRs 0002–0006 | ✅ |
| 0.5 | Doc fixes (balance cache principle, money comment, README bun) | ✅ |
| 0.6 | `.env.example` + gitignore exception | ✅ |

**Follow-up (separate small PR):** demote Playwright to `schedule` + `workflow_dispatch` only ([ADR-0004](./adr/0004-ci-gates-and-test-strategy.md)).

---

## Phase 1 — Quick wins (≈3–5 days)

*Low risk, high leverage. Do before large features.*

| # | Task | ADR / ref | Est. |
|---|------|-----------|------|
| 1.1 | Validate every imported journal with `checkJournal`; reject file on failure | ADR-0006 | 0.5–1 d |
| 1.2 | Export `currencies`, `exchange_rates`, `balance_snapshots`; add `schemaVersion` to backup JSON | ADR-0006 | 1 d |
| 1.3 | Privacy: disable PostHog session replay; remove amount from analytics events (or update `PRIVACY.MD`) | — | 0.5 d |
| 1.4 | Remove `EXPO_PUBLIC_` from true secrets; rotate tokens; document in `.env.example` | — | 0.5 d |
| 1.5 | Delete `reset-project` script + `scripts/reset-project.js` | — | 15 min |
| 1.6 | Remove root `postinstall` (litert-lm has its own guarded hook) | — | 15 min |
| 1.7 | Declare undeclared deps (`rxjs`, metro polyfills, `@expo/config-plugins`, `source-map-explorer`) | — | 1 h |
| 1.8 | Remove verified-unused npm packages (see PROJECT_BIBLE §11) | — | 1 h |
| 1.9 | Safe dead-code batch: 9 orphan files, duplicate `money.test.ts`, tracked junk (`test-money.ts`, `screenshot.png`, `ivyWalletLink`) | — | 2 h |
| 1.10 | Integration tests: `ledgerWriteService` post / revert / recover | ADR-0004 | 0.5 d |
| 1.11 | Journal save tests: use real `checkJournal`, add unbalanced rejection case | ADR-0004 | 1 h |
| 1.12 | `jest` `coverageThreshold` ratchet for `accounting/`, `ledgerWriteService`, `money.ts` | ADR-0004 | 1 h |
| 1.13 | Add `Workplace` to `CONTEXT.md`; fix model count in `docs/ARCHITECTURE.md` | — | 1 h |

**Exit criteria:** import cannot persist unbalanced journals; backup includes FX tables; privacy matches code or policy; CI stays green.

---

## Phase 2 — Money correctness (≈1–1.5 weeks)

| # | Task | ADR / ref | Est. |
|---|------|-----------|------|
| 2.1 | Introduce `convertAmount()` with `historical` vs `spot`; missing rate = explicit failure, never `1.0` | ADR-0005 | 1 d |
| 2.2 | Migrate net worth / `BalanceService` aggregation | ADR-0005 | 1 d |
| 2.3 | Migrate reports (`reportingDeltaEngine`, `report-service`) | ADR-0005 | 1 d |
| 2.4 | Migrate budgets + simulation + Safe-to-Spend | ADR-0005 | 2 d |
| 2.5 | Delete `getRateSafe`; update tests that mock it | ADR-0005 | 0.5 d |
| 2.6 | `Money.multiply` rounds like `add`/`subtract` + unit test | ADR-0003 | 1 h |
| 2.7 | UI/editor: route `JournalCalculator.isBalanced` through `checkJournal` | ADR-0003 | 2 h |

**Exit criteria:** multi-currency user sees no silent parity; historical reports use leg `exchange_rate` where appropriate.

---

## Phase 3 — Data safety (≈1–2 weeks)

| # | Task | ADR / ref | Est. |
|---|------|-----------|------|
| 3.1 | Auto pre-import backup file + user-visible path in UI | ADR-0006 | 1 d |
| 3.2 | Restore: validate → stage in new workplace → swap active → delete old | ADR-0006 | 3–5 d |
| 3.3 | Migration test harness: fixture DB at v27, migrate to v28, assert row counts + one balance | ADR-0004 | 2–3 d |
| 3.4 | Add migration test to CI | ADR-0004 | 1 h |
| 3.5 | Log integrity repairs to audit log (or settings “last repair” summary) | ADR-0002 | 0.5 d |

**Exit criteria:** failed restore never leaves an empty workplace; at least one migration is regression-tested in CI.

---

## Phase 4 — Velocity & deepening (ongoing, pick 1–2 at a time)

*Aligns with [codebase-design/AUDIT.md](./codebase-design/AUDIT.md) backlog.*

| # | Task | Notes |
|---|------|--------|
| 4.1 | Continue journal/account repository intent splits | Partial in §0 |
| 4.2 | Thin fat view-models (journal/account editors) — push rules to services | P1 in AUDIT |
| 4.3 | Coalesce ReportService / ReactiveDataService entry points | Avoid duplicate “dashboard knowledge” |
| 4.4 | Block account delete when transactions exist (or force merge) | Invariant #11 |
| 4.5 | Sign rules: generate SQL from `BalanceEffects` or parity test TS vs SQL | P2 |
| 4.6 | Spike: schema-driven import (mirror export `tableTasks`) | Cuts 8–12 touchpoint tax |

**Feature shortcuts (after Phase 1–2):**

| Feature | When | Est. |
|---------|------|------|
| Guided split transactions (simple editor) | After 2.7 | S, 3–5 d |
| New report types | Anytime after 2.3 | S–M |
| Budget rollover | After 3.3 + simulation tests | M–L |
| Reconciliation (cleared flags) | Wire or replace `ReconciliationRepository` | M–L |

**Explicitly later:** cloud sync, attachments, encrypted backup (see `FUTURE_ROADMAP.md`).

---

## Suggested order for the next three PRs

1. **PR-A — Hygiene & CI follow-up:** Phase 0 Playwright schedule + Phase 1.5–1.9  
2. **PR-B — Import/export & privacy:** Phase 1.1–1.4  
3. **PR-C — Ledger test hardening:** Phase 1.10–1.12  

Then start **Phase 2.1** (FX API) as its own branch.

---

## Tracking

| Phase | Target window | Status |
|-------|---------------|--------|
| 0 | 2026-07-25 | In commit |
| 1 | Next ~1 week | Not started |
| 2 | Following ~1.5 weeks | Not started |
| 3 | After Phase 2 or parallel if restore is urgent | Not started |
| 4 | Continuous | Not started |
