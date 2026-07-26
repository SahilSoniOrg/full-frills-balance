# ADR-0006: Restore must never destroy data it cannot replace

- **Status:** Accepted (implemented 2026-07-25)
- **Date:** 2026-07-25

## Context

This is an offline-first app with no cloud sync. The on-device SQLite database is
the user's **only** copy of their financial history. The JSON/ZIP export is the
only disaster-recovery mechanism that exists.

## Problem

Three independent defects make the recovery path itself a data-loss risk.

1. **Restore wipes before it writes.** `ImportService.executeImport` calls
   `integrityService.resetWorkplace(workplaceId, true)` and *then*
   `batchInsert` (`ImportService.ts:90-125`). `batchInsert` is individually
   transactional, but the wipe is not part of that transaction. If the insert
   fails — corrupt file, disk full, a v26 workplace trigger rejection — the
   workplace is left **empty**.
2. **The export is not a complete backup.** `exportToJSON` covers 12 tables and
   omits `currencies`, `exchange_rates` and `balance_snapshots`
   (`export-service.ts:432-444`), even though `getExportSummary` counts them. It
   is also scoped to a single workplace, so a multi-workplace user silently
   exports a subset of their data.
3. **Restore bypasses the double-entry invariant.** `batchInsert` writes journals
   and transactions without calling `checkJournal`, so a corrupt or
   buggy-plugin-produced file can install permanently unbalanced books. The
   post-import integrity pass only reconciles `running_balance` against the
   transaction sum — it does not detect debits ≠ credits.

## Decision

1. **Never destroy before the replacement is durable.** Validate and stage first,
   then swap. Concretely: parse → validate every journal with `checkJournal` →
   import into a new workplace ID → swap the active workplace → delete the old
   one. This makes a failed restore a no-op.
2. **Take an automatic pre-import snapshot** and tell the user where it is.
3. **Export every table**, or fail loudly listing what was excluded. Add an
   explicit `schemaVersion` alongside the existing `1.4.0` file version so an
   old backup meeting a newer schema is a detectable condition rather than a
   guess.
4. **Validate on the way in.** A file is untrusted input, even one we wrote.

## Alternatives considered

- **Wrap wipe + insert in a single `database.write`.** Simpler, and a real
  improvement, but a very large import inside one transaction risks memory
  pressure, and it still offers no recovery if the *file* is bad.
- **Merge instead of replace.** Avoids destruction entirely, but requires
  identity/conflict rules the app does not have yet (see the sync assessment).
- **Document the risk and tell users to keep their own backup.** Cheapest, and
  currently what effectively happens; unacceptable for the primary recovery path.

## Trade-offs

- **Benefit:** restore stops being the most dangerous operation in the app;
  corrupt imports become impossible to persist.
- **Cost:** transiently needs storage for two copies; the import flow is
  restructured — the highest-effort item, and it touches
  `native-plugin`/`ivy`/`cashew` shapes.

## Consequences

`ImportRepository` is hand-written per entity while export is schema-driven from
`schema.ts`. That asymmetry is why adding one field costs ~8–12 touchpoints and
why import drifts (it already reads only `deviceSourceId` and would silently drop
the legacy `deviceSmsId` field from older backups). Making import schema-driven
would fix both the drift and the field-add tax.

## Migration strategy

1. Add `checkJournal` validation to the import parse step and reject on failure.
   *Cheap, no restructuring, closes the corruption hole.*
2. Add the missing tables to `exportToJSON` and add `schemaVersion`.
   *Cheap, makes existing backups complete.*
3. Add an automatic pre-import backup written to a user-visible location.
4. Restructure to stage-then-swap.
5. Only then consider making import schema-driven to mirror export.

## Implementation (2026-07-25)

- Import validates journals (`validateImportedData` / `checkJournal` on parse).
- Export includes `currencies`, `exchange_rates`, `balance_snapshots` via `WORKPLACE_DATA_TABLES`.
- Staged restore + pre-import backup (see `importStaging.ts`, `ImportService.ts`).
- Export remains **single-workplace**; multi-workplace backup is still a gap.
