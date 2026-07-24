# ADR-0003: Money is a decimal float with centralised edge-rounding

- **Status:** Accepted (documenting existing behaviour), with a known risk
- **Date:** 2026-07-25

## Context

Every monetary column (`transactions.amount`, `journals.total_amount`,
`budgets.amount`, …) is a WatermelonDB `type: 'number'`, i.e. an IEEE-754 double
in SQLite.

## Problem

`schema.ts` documented `amount` as *"in minor units"*, implying integer cents.
That is false: `sanitizeAmount` and `prepareJournalData` store the result of
`roundToPrecision(value, precision)`, which yields decimals such as `123.45`
(`src/utils/money.ts:8-11`, `src/utils/validation.ts:66-74`).

The comment was not harmless. During the 2026-07-25 architecture audit it caused
a specialist reviewer to conclude the app used integer minor units and to report
the opposite finding. A false comment on a money column will eventually cause a
wrong fix.

## Decision

Money is a **decimal float**, made safe by an *edge-rounding* strategy: round at
every arithmetic boundary rather than deferring to the end.

- All monetary arithmetic goes through `src/utils/money.ts` — `roundToPrecision`,
  `safeAdd`, `safeSubtract`, `amountsAreEqual`, `getEpsilon`.
- Precision is per-currency, from `AppConfig.constants.precision`.
- Zero/equality comparisons use `getEpsilon(precision)`, never `==`.

We are **not** migrating to integer minor units now. The migration would touch
every monetary column, all 27 existing migrations' assumptions, the export
format, all three import plugins and the raw SQL layer — against a migration
suite that currently has zero tests. The risk exceeds the benefit while
edge-rounding holds.

## Alternatives considered

- **Integer minor units.** The correct long-term representation; exact by
  construction. Deferred: very large blast radius, and it requires a tested
  migration harness first (see ADR-0004).
- **Decimal library (dinero.js / big.js).** Exact, but adds a dependency, a
  serialisation boundary at the DB, and a second money vocabulary alongside the
  existing helpers.

## Trade-offs

- **Benefit:** no migration risk; no new dependency; helpers already exist and
  are unit-tested.
- **Cost:** correctness depends on discipline. Any code doing raw `+`/`-`/`*` on
  money bypasses the guard, and nothing mechanically enforces it.

## Consequences

- `Money.multiply` — the FX application path — does **not** round, unlike `add`
  and `subtract`, and has no test.
- `JournalCalculator.isBalanced` hard-codes an epsilon of `0.001` and a comment
  asserting "all individual lines are rounded to 2 decimals"
  (`JournalCalculator.ts:73-78`). That is wrong for a 0-decimal currency (JPY) or
  a 3-decimal currency, and it diverges from `BalanceEffects.checkJournal`, which
  derives epsilon from precision. Two different "is this journal balanced?"
  answers can therefore disagree between the editor UI and the write path.

## Migration strategy

Immediate (low risk, high value):

1. Fix the `schema.ts` comment. **Done.**
2. Make `Money.multiply` round like its siblings, and unit-test it.
3. Collapse `JournalCalculator.isBalanced` onto `BalanceEffects.checkJournal` so
   one precision-aware rule answers the question everywhere.
4. Add an ESLint rule (or a test) forbidding raw arithmetic on `amount` fields
   outside `src/utils/money.ts`.

Only after a migration test harness exists should integer minor units be
reconsidered.
