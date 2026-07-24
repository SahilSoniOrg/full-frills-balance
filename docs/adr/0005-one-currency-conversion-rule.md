# ADR-0005: One currency conversion rule; never silently assume parity

- **Status:** Proposed
- **Date:** 2026-07-25

## Context

The app is multi-currency: accounts carry a `currencyCode`, transactions store a
per-leg `exchange_rate`, and every aggregate view (net worth, reports, budgets,
Safe-to-Spend) must convert into a single display currency.

## Problem

There are currently **two different conversion rules**, and one of them fails
silently.

1. **The write path is historical and correct.** `BalanceEffects.checkJournal`
   validates a journal using each leg's stored `exchange_rate`
   (`BalanceEffects.ts:116-122`).
2. **Every read path uses live spot rates and ignores the stored rate.**
   `reportingDeltaEngine.ts:54-62`, `budgetReadService.ts:134-137`,
   `CashFlowSimulationService.ts:107-112`, `BalanceService.ts:191-192` all call
   `exchangeRateService.getRateSafe(...)`.
3. **`getRateSafe` returns `1.0` on a cache miss** and triggers a background
   fetch (`exchange-rate-service.ts:63-76`).

`1.0` is not a neutral default between two different currencies — it is a wrong
answer that looks like a real number. On a cold cache, a multi-currency user's
net worth, reports, budget "spent" figures and Safe-to-Spend can all be wrong,
with no error, no label, and no log. Reports also drift over time because
historical transactions are revalued at today's rate.

This directly violates the project's own stated severity rule: *"silent numerical
mistakes are higher severity than crashes."*

## Decision

Introduce one conversion entry point and forbid silent parity.

```
convertAmount(amount, from, to, { at: 'historical' | 'spot' }): Result
```

- **Historical mode** (reports, ledger-derived figures) prefers the transaction's
  stored `exchange_rate`; falls back to the dated rate.
- **Spot mode** (forward-looking simulation) uses current rates.
- A missing rate is **never** silently `1.0`. It returns an explicit
  "rate unavailable" outcome; callers either await the fetch or render an
  explicitly-labelled estimate.
- `getRateSafe` is deleted.

## Alternatives considered

- **Keep `getRateSafe`, log on fallback.** Cheapest, but the number shown to the
  user is still wrong; logging does not fix a displayed balance.
- **Block all rendering until rates load.** Correct but poor UX offline, and this
  is an offline-first app.
- **Store a normalised base-currency amount on every transaction.** Removes read
  conversion entirely and is attractive long-term, but requires a schema
  migration and a backfill against an untested migration suite.

## Trade-offs

- **Benefit:** one rule; wrong numbers become impossible to show unlabelled;
  historical reports stop drifting.
- **Cost:** touches ~10–15 files; some displayed figures will *change*, which
  will look like a regression but is the bug being fixed. Single-currency users
  see no change, which limits blast radius.

## Consequences

Simulation and Safe-to-Spend tests currently mock `getRateSafe` (and in one case
mock `convert` to an identity function), so they do not exercise conversion at
all. Those tests must be re-pointed at the new seam or they will keep passing
while the behaviour changes.

## Migration strategy

1. Add `convertAmount` alongside the existing service; no callers yet.
2. Add tests for the missing-rate outcome, both modes, and precision.
3. Migrate read paths one at a time, highest-visibility first: net worth →
   reports → budgets → simulation.
4. Delete `getRateSafe` once it has no callers; add a lint rule banning
   reintroduction of a parity fallback.
