# ADR-0002: Derived balances served from a reconciled cache

- **Status:** Accepted (documenting existing behaviour)
- **Date:** 2026-07-25

## Context

Account balances are the most-read value in the app: the dashboard, the account
list, Safe-to-Spend and the widgets all need them on every render. Summing all
transactions for every account on every read does not hold up on a multi-year
ledger on a mid-range Android device.

## Problem

The documented principle was *"balances are derived, never cached"*, but
`BalanceService.getAccountBalance` returns `latestTx.runningBalance` — a
persisted column (`src/services/BalanceService.ts:372`). The doc and the code
disagreed, and three services exist solely to maintain that cache
(`AccountingRebuildService`, `RebuildQueueService`, `integrity-service`).

This mismatch is actively dangerous: a reasonable engineer reading the principle
would "fix" `getAccountBalance` to sum transactions inline and silently destroy
the hot path.

## Decision

Balances are **derived by definition, cached in practice, and reconciled
continuously**:

1. The *definition* of a balance is the signed sum of its transactions, folded
   through `BalanceEffects.foldBalances`.
2. Reads are served from `transactions.running_balance`, an explicitly
   rebuildable cache.
3. `IntegrityService` recomputes from transaction sums and repairs drift;
   `RebuildQueueService` schedules rebuilds after writes.
4. `running_balance` is never a user-editable total and is never exported.

The invariant to protect is **convergence**: the cache must always converge to
the derived sum. It is not "the cache does not exist".

## Alternatives considered

- **Sum on every read.** Correct by construction, but unacceptably slow on large
  ledgers and would regress the dashboard and list paths.
- **Materialised balance column on `accounts`.** Fewer rows to scan, but it
  becomes a second source of truth that is far easier to corrupt, and it breaks
  historical (as-of-date) queries.
- **Event-sourced projections.** Cleaner conceptually, far more machinery than a
  solo maintainer should carry.

## Trade-offs

- **Benefit:** fast reads; self-healing; historical queries still possible.
- **Cost:** a window after a write where the cache is stale (rebuild is debounced
  ~500ms, `app-config.ts`). Any code path that computes *new* financial values
  from a possibly-stale cache can compound the error — notably
  `accountAdjustCommands.adjustAccountBalance`.

## Consequences

- Warm starts skip the full integrity scan unless the schema version changed, so
  drift can persist across sessions (`integrity-service.ts:435-447`).
- Repairs are logged to analytics but **not** to the audit log, so a recurring
  upstream write bug is invisible.

## Migration strategy

No migration; this documents existing behaviour. Follow-up work, in order:

1. Record integrity repairs in the audit log so recurring drift is diagnosable.
2. Make write-then-derive paths (`adjustBalance`, reconciliation) compute from
   the derived sum rather than the cache.
3. Add a cheap cache-vs-sum spot check on warm start.
