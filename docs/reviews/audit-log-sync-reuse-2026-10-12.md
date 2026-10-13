# Audit Logs as a Foundation for Sync Conflict Handling

Date: 12 October 2026.

Verdict: **Fixable. Reuse the audit change model, write boundaries, and presentation helpers. The current audit history is not a complete or causally ordered sync-operation log.**

Scope: read-only inspection of audit storage, journal/account mutation paths, undo guards, history UI, privacy/import behavior, and existing tests. No application implementation was changed. This is not an exhaustive audit-coverage inventory of every writer in the repository.

## What already exists

| Capability | Evidence | Potential reuse |
| --- | --- | --- |
| Workplace/entity-scoped history | [AuditLog model](../../src/data/models/AuditLog.ts), [AuditRepository](../../src/data/repositories/AuditRepository.ts) | Entity routing and local history queries. |
| Versioned before/after field changes | [auditEvents](../../src/types/auditEvents.ts), `deriveAuditFieldDeltas` and `createAuditEventPayload` | Changed-field extraction and human-readable explanations. |
| Journal header and financial-line snapshots | [journalPutOperations](../../src/data/repositories/journal/journalPutOperations.ts), [journalPersistenceSupport](../../src/data/repositories/journal/journalPersistenceSupport.ts) | Amount/description comparison, treating financial lines as one unit. |
| Domain changes and history together | [AccountingWriteSession](../../src/data/repositories/AccountingWriteSession.ts), `runAccountingWriteSession` | Capture sync intent in the same durable batch as the accounting mutation. |
| Guarded undo and compensating history | [journalAuditGuard](../../src/data/repositories/journal/journalAuditGuard.ts), [accountAuditCommands](../../src/services/accounts/accountAuditCommands.ts), [audit handlers](../../src/services/audit-handlers.ts) | Validate expected current state before applying a resolution; record a new history event rather than erase prior edits. |
| Actor/source/correlation/revert information | [auditEvents](../../src/types/auditEvents.ts), [audit identity](../../src/services/audit-identity.ts) | Explain who/what produced a change, after adding authenticated online author identity. |
| Existing before/after UI | [auditLogTypes](../../src/services/audit/auditLogTypes.ts), [AuditLogChangesView](../../src/features/audit/components/AuditLogChangesView.tsx), [AuditTransactionDiff](../../src/features/audit/components/AuditTransactionDiff.tsx) | Formatting and display vocabulary for a new base/local/remote review screen. |
| Audit history in snapshots/imports | [workplaceSnapshot](../../src/services/backup/workplaceSnapshot.ts), [importWriters](../../src/data/repositories/importWriters.ts) | Preserve explanatory history through recovery. This does not implement replication. |

The current payload schema is version 2. For UPDATE events, the payload creator deliberately stores only changed fields in `before` and `after`; unchanged context is generally omitted. The schema version is a serialization format identifier, not a journal revision or causal timestamp.

## The amount-versus-name example

The app's journal label is `description`. A normal amount edit records changes to `totalAmount` and the `transactions` array. A description-only rename records just `description`, using the `journal.renamed` event. Both paths create history alongside their domain writes.

That provides the ingredients to explain two disjoint edits:

```text
Edit A: changed { totalAmount, transactions }
Edit B: changed { description }
```

Once a sync protocol establishes the shared base revision, the client can combine A's complete financial-line state with B's description, validate the resulting journal through the accounting write path, and publish a new resolution revision without asking the user.

The current logs do not establish that shared base. Two unrelated logs with disjoint fields are not enough to prove they are concurrent or safe to combine. Intermediate edits, deletes, dependency changes, and audit gaps must be accounted for. Safe same-result changes can also be deduplicated after an authoritative comparison; competing changes to dependent financial fields require transaction-level policy.

## Gaps that prevent using audit history directly as sync

### 1. Missing revision ancestry

Audit rows contain entity identity, action, changes, timestamps, and optional source/event/correlation information. They do not contain an authoritative base revision, result revision, parent operation set, or current entity-head reference.

`Date.now()` and sorting by timestamp plus ID order the local history view. They cannot establish cross-device causality. Equal before-values do not prove a common revision; data can change and later return to the same value.

Undo compares expected values against current rows inside a serialized write session. This is useful stale-write protection, but it is not a multi-device revision protocol. `revertsLogId` links a compensating undo to one audit entry; it is not general revision ancestry.

### 2. Concrete missing audit coverage

The ordinary bulk source/destination account-change path calls [bulkChangeAccount](../../src/services/journal/bulk/bulkChangeAccount.ts) → `journalPersistenceService.reassignAccounts` → `stageReassignAccounts` in [journalCrossJournalOperations](../../src/data/repositories/journal/journalCrossJournalOperations.ts).

`stageReassignAccounts` validates the journals, updates transaction account IDs, updates journal display type/timestamps, and commits the rows. It does not stage an audit entry. The bulk undo path uses the same repository operation and also does not add history. Account-merge retargeting is a different operation and does create `journal.accounts_retargeted` audit entries.

This is a source-traced coverage gap, not a new runtime failure demonstrated by the existing tests. A sync stream built solely by collecting audit rows would miss these financial edits. Additionally, account repository methods allow optional audit contributions, so coverage is not enforced simply by routing through a repository.

### 3. Audit payloads are intentionally incomplete and sometimes best-effort

Compact UPDATE events are sparse patches, not complete common-base snapshots. Journal audit snapshots contain selected header fields and financial-line values, but omit transaction row IDs and other source fields such as journal relationship/metadata state. Some lifecycle events use descriptive markers rather than a directly replayable state replacement.

`AuditRepository.applyEntryToRecord` catches payload serialization errors and stores a non-undoable error summary instead. That is reasonable for explanatory history, but it cannot be accepted as the only durable description of a financial operation waiting to sync.

A sync operation needs a validated canonical mutation payload and a way to retrieve/reconstruct its precise base state. Replaying arbitrary legacy audit JSON is insufficient.

### 4. Financial line diffs need stronger identity and grouping

Journal audit lines are value snapshots without stable transaction IDs. The transaction display helper pairs lines by account ID and takes the first match; it is not suitable for merging split journals with repeated account legs. Its unchanged-line helper focuses on displayed amount/type, so it is not an authoritative detector for notes, FX, currency, or all other semantic changes.

Reuse display formatting with normalization and a new three-way comparison model. Treat the full financial-line set as an atomic merge group initially. Do not reuse the existing display diff as the resolution engine.

### 5. No durable replication or conflict lifecycle

The audit table has no upload acknowledgement, dependency delivery state, server cursor, conflict candidate status, resolution parents, or deterministic recurring-occurrence identity. Existing WatermelonDB bookkeeping flags are not an implemented online protocol; imported records are explicitly marked synced locally.

Some composite operations use `correlationId` across multiple audit entries, but it is optional and has no operation manifest or completeness guarantee. Grouping related history entries is not proof that every affected entity must replicate atomically.

`mergeAuditLogsById` merges/deduplicates lists for history display. The audit-merge integration tests exercise domain account merges and their history. Neither implements concurrent-version merging.

### 6. History is not an immutable protocol record

[SmsPrivacyRepository](../../src/data/repositories/SmsPrivacyRepository.ts) can rewrite existing audit payloads during privacy remediation. [Native import remapping](../../src/services/import/plugins/nativeImportAuditRemap.ts) adjusts historical entity references when creating copied books. Import markers, repairs, and baseline history must be distinguished from new source operations.

Do not make delivery depend on mutable historical bytes. A future pending operation must retain its exact validated payload/identity until acknowledgement or durable conflict retention. Privacy and retention policies for operations need explicit treatment; this does not justify preserving unnecessary raw SMS data.

Bounded history queries also do not establish a complete ancestry chain. I did not find an automatic history-pruning policy in the paths inspected, and the archive exporter is a read-only export, not proof of sync retention.

## Recommended reuse boundary

Capture one domain mutation description at the existing accounting write boundary and use it for both audit presentation and sync intent. Keep the existing history system useful for offline books; do not rewrite old logs into pretend server revisions.

```text
Accounting command
  → load current state and revision/dependencies
  → validate canonical journal/mutation
  → one local atomic batch:
       accounting rows
       audit entry describing the change
       durable sync-operation/outbox entry for enrolled Workplaces
  → upload after commit
```

The future sync-operation envelope needs at least a stable operation ID, entity/aggregate identity, base revision/parents, online author/device context, schema/key generation, validated encrypted mutation payload, and durable delivery/conflict state. Multi-entity commands need an explicit atomic mutation bundle and relevant reference/deletion preconditions. Event IDs or correlations can be linked/reused where their guarantees are established; timestamps cannot substitute for parents.

The server checks authenticated routing and base revisions without reading financial contents. The client decrypts the common base and candidate changes, applies domain-specific three-way merge rules, and validates the complete resulting transaction. Both candidates must survive rejection/interruption until the result is safely committed. Automatic and human resolutions should produce a new revision and audit event referencing the input operations, while preserving history.

For user-facing review, reuse existing date/currency/account labels and before/after formatting in a base/local/remote comparison screen. Keep resolution actions separate from audit undo. Choosing one candidate is not equivalent to reverting a history entry.

## Verification

Seven existing suites passed: **82 tests**.

- `src/services/__tests__/audit-service.test.ts`
- `src/services/__tests__/auditUndo.integration.test.ts`
- `src/services/__tests__/auditMerge.integration.test.ts`
- `src/features/audit/__tests__/auditLogTypes.test.ts`
- `src/features/audit/__tests__/auditLogDiffDisplay.test.ts`
- `src/features/audit/__tests__/AuditLogChangesView.test.tsx`
- `src/data/repositories/journal/__tests__/JournalPersistenceRepository.test.ts`

These verify current audit dispatch, truthful history/undo cases, display helpers, accounting validation, and journal write atomicity in the test runtime. They do not prove cloud replication, concurrent-device merge behavior, full writer coverage, or native failure durability. No new tests or application changes were made.

## Next design step

Define journal-level merge groups and revision/operation semantics first, then inventory source-mutation coverage before relying on audit-derived changes. The first focused proof should cover amount versus description, competing amounts, repeated account legs, account reassignment, delete versus edit, stale resolution, offline edit chains, upload retry, and account-merge dependencies.

Reuse the audit groundwork for capture and explanation. Add the missing causal, delivery, and resolution machinery deliberately; do not label the current history table a working sync log.
