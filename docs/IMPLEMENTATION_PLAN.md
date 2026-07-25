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

**Follow-up:** demote Playwright to `schedule` + `workflow_dispatch` only — ✅ ([ADR-0004](./adr/0004-ci-gates-and-test-strategy.md)).

---

## Phase 1 — Quick wins ✅ (2026-07-25)

| # | Task | Status |
|---|------|--------|
| 1.1 | Import `checkJournal` validation | ✅ |
| 1.2 | Export FX tables + `schemaVersion` | ✅ |
| 1.3 | Privacy / analytics | ✅ |
| 1.4 | `.env.example` secret guidance | ✅ (rotate tokens manually; code: `HF_TOKEN` fallback) |
| 1.5 | Remove `reset-project` | ✅ |
| 1.6 | Remove root `postinstall` | ✅ |
| 1.7 | Declare undeclared deps | ✅ |
| 1.8 | Remove unused packages | ✅ |
| 1.9 | Dead-code batch | ✅ |
| 1.10 | Ledger lifecycle tests | ✅ |
| 1.11 | Real `checkJournal` in journal tests | ✅ |
| 1.12 | Coverage thresholds | ✅ |
| 1.13 | Workplace docs | ✅ |

**Exit criteria:** met — `bun run verify` green (2026-07-25).

---

## Phase 2 — Money correctness (≈1–1.5 weeks) — **in progress**

| # | Task | ADR / ref | Est. |
|---|------|-----------|------|
| 2.1 | Introduce `convertAmount()` | ADR-0005 | ✅ |
| 2.6 | `Money.multiply` rounding | ADR-0003 | ✅ |
| 2.7 | `JournalCalculator` → `checkJournal` | ADR-0003 | ✅ |
| 2.2 | BalanceService aggregation | ADR-0005 | ✅ |
| 2.3 | Reports / deltas | ADR-0005 | ✅ |
| 2.4 | Budget + simulation + STS | ADR-0005 | ✅ |
| 2.5 | Remove `getRateSafe` | ADR-0005 | ✅ |

**Phase 2 exit criteria:** met (2026-07-25).

---

## Phase 3 — Data safety — **in progress**

| # | Task | ADR / ref | Est. |
|---|------|-----------|------|
| 3.1 | Auto pre-import backup | ADR-0006 | ✅ |
| 3.3 | Migration smoke test | ADR-0004 | ✅ |
| 3.2 | Staged restore (swap, no wipe-first) | ADR-0006 | ✅ |
| 3.4 | Migration smoke in CI (explicit step) | ADR-0004 | ✅ |
| 3.5 | Log integrity repairs to audit log | ADR-0002 | ✅ |

**Phase 3 exit criteria:** met (2026-07-25) — staged import + pre-backup + migration smoke in CI.

---

## Phase 4 — Velocity & deepening (ongoing, pick 1–2 at a time)

*Aligns with [codebase-design/AUDIT.md](./codebase-design/AUDIT.md) backlog.*

| # | Task | Notes |
|---|------|--------|
| 4.1 | Continue journal/account repository intent splits | Partial in §0 |
| 4.2 | Thin fat view-models (journal/account editors) — push rules to services | P1 in AUDIT |
| 4.3 | Coalesce ReportService / ReactiveDataService entry points | Avoid duplicate “dashboard knowledge” |
| 4.4 | Block account delete when transactions exist (or force merge) | Invariant #11 | ✅ |
| 4.5 | Sign rules: parity test TS vs SQL | P2 | ✅ (starter test) |
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

## Next up

1. **Phase 4** — AUDIT backlog (4.1–4.3, 4.6 spike), feature shortcuts (split tx, reports)
2. **Docs** — refresh `PROJECT_BIBLE.md` §9 (FX P0 closed), push `main` to run CI

---

## Tracking

| Phase | Status |
|-------|--------|
| 0 | ✅ committed + Playwright demoted |
| 1 | ✅ implemented (pending commit) |
| 2 | In progress |
| 3 | Not started |
| 4 | Ongoing |
