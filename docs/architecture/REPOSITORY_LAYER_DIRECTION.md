# Repository Layer Direction and Refactor Plan

Status: Phases 0–6 complete; implementation is in the repository-layer PR
Scope: repositories inside the Full Frills Balance app codebase
Related: [Architecture Audit](./ARCHITECTURE_AUDIT.md), [Persistence Ownership Inventory](./PERSISTENCE_OWNERSHIP_INVENTORY.md)

## Decision

Make routine persistence consistent through small, typed, entity-owned interfaces. Keep multi-record accounting behavior in explicit domain workflows that use one atomic write session. Extract shared query and adapter mechanics only where there is repeated behavior with the same semantics.

Do **not** create a universal `Repository<T>` with generic CRUD, an all-purpose query object, or a mega repository. Those interfaces would make the code look uniform while hiding important differences: a journal owns transaction legs and audit records; audit rows are append-only; snapshots are derived; imports have privileged publication rules.

The goal is a repository layer that makes ownership obvious, keeps ordinary operations easy to find, and makes accounting writes hard to perform incorrectly.

## Current assessment

This repository already has useful persistence boundaries. `JournalPersistenceRepository` and `AccountingWriteSession` support atomic accounting changes; import publication has a deliberate batch boundary; rebuild and inbox persistence have specialized owners. The remaining problem is unevenness between those boundaries and duplication in read/write APIs.

The highest-value seams to improve are:

1. **Journal reads:** ordinary journal fetches now have one canonical owner in `journalQueryRepository.ts`. Timeline filtering lives in `JournalObserveQueries`; enrichment, SMS, and planned-payment projections remain specialized.
2. **Journal inputs:** `CreateJournalData`, `PutJournalInput`, and `PutJournalPatchInput` repeat line and metadata shapes. Share the stable write fields, but retain a distinct sparse patch type.
3. **Transaction reads:** `findByJournals` and `findByIds` repeat chunked fetch logic. Share safe chunk execution and criteria where semantics match; retain special ordering and joined budget queries.
4. **Account reads:** fetch and observe repositories repeat workplace, type, ID, and deleted-row filters. Share filter construction, but preserve separate fetch and reactive interfaces because observation columns and RxJS behavior are part of their contracts.
5. **Account writes:** create uses `AccountingWriteSession`, while update, delete, recover, and hierarchy flows use a mix of direct writers, prepared operations, and `persistBatch`. Converge the entry points around a documented account mutation plan and explicit commit boundary.
6. **Raw SQL:** `TransactionRawRepository` has become a broad facade for metrics, rebuilds, patterns, observations, and arbitrary `queryRaw`. Keep typed, feature-owned SQL operations; narrow the raw adapter and stop exposing arbitrary SQL as a general feature API.

These changes should build on the completed architecture and persistence ownership work. They do not reopen its completed dependency-cycle, domain-type, import, or direct-write cleanups.

## Target shape

```text
feature / background trigger
  -> application command or query (express intent; orchestrate)
       -> domain workflow for multi-record invariants
            -> entity query/write modules (scoped reads; prepare table-local operations)
            -> one explicit write session when atomicity spans records or entities
       -> typed commit result
  -> after-commit effects (rebuild trigger, cache invalidation, analytics)

entity modules -> WatermelonDB adapter / narrow raw-SQL adapter
```

Responsibilities:

- **Application commands and queries** accept typed inputs, apply use-case validation, and coordinate the work. They do not manipulate WatermelonDB models or open database writers.
- **Domain workflows** own rules spanning records or entities: journal posting, reversal, merge, account hierarchy changes, planned-payment occurrence creation, inbox-to-journal linking, and import publication. They choose the repositories and atomic boundary needed by that rule.
- **Entity persistence modules** own workplace-scoped reads, entity-local validation and preparation, and stable write operations. They return domain results or prepared operations, not raw table access to callers.
- **Query modules** own fetch and observe semantics. Shared filter construction is allowed; fetch and observable behavior remain separate when their contracts differ.
- **Adapters** isolate WatermelonDB and raw SQL mechanics. SQL feature modules expose named, typed queries rather than making callers assemble SQL through a general repository.
- **After-commit effects** run only after durable writes succeed. The commit result should state the required effect (for example, affected accounts and earliest rebuild date); the dispatcher or service performs it after commit.

This is a boundary model, not a requirement to add one class or abstraction per box. Add a seam only when it improves ownership, correctness, or reuse for real callers.

## CRUD policy by data shape

Use ordinary CRUD for entities whose writes are genuinely local. A standard entity surface should be small and explicit: create, scoped lookup/list, update with a typed patch, and delete/recover only when those operations are valid for that entity. Include `workplaceId` in every workplace-owned query and mutation.

Do not force the same CRUD contract onto every table:

| Data / current owner                               | CRUD direction                                                                                                                                                          | Complex workflow owner                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Account                                            | Scoped lookup/list and typed create/update/delete/recover APIs. Hierarchy and archive fields stay behind validated mutations.                                           | Account commands/coordinator for opening balances, hierarchy/order changes, archive/recovery, and merge.                             |
| Journal + transaction legs                         | Treat as one ledger aggregate. Do not expose independent transaction-leg CRUD. Keep semantic journal operations such as put, post, reverse, merge, delete, and recover. | Journal/ledger workflow using `JournalPersistenceRepository` and one accounting write session; audit joins the batch where required. |
| Planned payment                                    | Ordinary schedule reads and local schedule edits may use CRUD-like operations. Occurrence identity and schedule advancement are not ordinary updates.                   | Planned-payment workflow stages schedule changes with journal creation/post/skip atomically.                                         |
| Transaction inbox                                  | Keep inbox row status and lookup APIs distinct from ledger transactions. Linking or auto-posting must maintain inbox and journal consistency.                           | Inbox/import/SMS workflow; link and ledger writes share a transaction when the operation requires it.                                |
| Budget and auto-post rule                          | Use small typed CRUD surfaces where current behavior is local and callers need it. Validate workplace and referenced account ownership.                                 | Budget calculations and auto-post execution stay in their feature workflows.                                                         |
| Balance snapshots and running balances             | Expose read/rebuild operations, not general-purpose CRUD. They are disposable projections.                                                                              | Rebuild/integrity workflow; source-of-truth changes remain journal writes.                                                           |
| Audit records                                      | Append and query; no update/delete API in normal feature code.                                                                                                          | The owning mutation includes audit creation in its atomic batch when that is the audit contract.                                     |
| Import/export, database reset, workplace lifecycle | Keep privileged, workflow-specific interfaces. Do not disguise them as entity CRUD.                                                                                     | Restore/import/export/workplace lifecycle owners.                                                                                    |
| Currency and exchange-rate reference data          | Keep focused typed read/write operations matching actual callers; do not broaden into a generic settings store.                                                         | Conversion and sync workflows retain their existing domain rules.                                                                    |

## Interface and shared-utility rules

### Inputs and query shapes

- Inputs describe intent with IDs and plain values, not WatermelonDB models.
- Keep create/full-write and sparse-patch inputs distinct. A patch should represent omission intentionally; avoid `Partial<Model>` and ambiguous `undefined` behavior.
- Prefer named query inputs when they remove real duplication. Keep separate methods for operations whose ordering, status inclusion, projection, or error behavior differs.
- Avoid a wide optional-parameter bag. Use a small filter shared by several callers, or a discriminated query shape when operations have materially different semantics.
- Document empty-ID behavior, deleted-row behavior, deterministic ordering, chunk boundaries, and not-found behavior at the interface.
- Make read errors visible where they indicate a real failure. Do not silently convert every database error into “not found.” Preserve deliberate null-on-missing semantics only where callers rely on them.

### Shared utilities worth having

1. **Workplace and deleted-row filter builders** for repeated entity query rules. They should make scoping mandatory in the calling interface and not allow a caller to accidentally omit it.
2. **Bounded ID chunk execution** where WatermelonDB limits require it. It should state whether chunk results preserve input order or database order; callers needing stable ordering must request or apply it explicitly.
3. **Typed journal write components** for line, metadata, and common full-write fields, shared by editor/service/persistence inputs. Sparse patch semantics remain separate.
4. **A narrow raw SQL executor** responsible for adapter access and row normalization. Feature query modules own SQL and typed row mapping.
5. **A single preferred accounting write-session path** for ledger-affecting multi-record writes. Clarify the remaining role of `persistBatch`; retain it for bounded non-ledger prepared batches only where its simpler contract is sufficient.

Do not centralize domain rules in “common utilities.” Balance effects, account hierarchy validation, active journal status policy, journal merge rules, and import conversion belong with their owning domain workflow.

## Refactor roadmap

Each phase is a separately reviewable change. Preserve current behavior first; improve public interface shape only after callers and semantics are mapped. Existing uncommitted work must remain intact while carrying out this plan.

### Phase 0 — Freeze the ownership contracts

**Work**

- Use `PERSISTENCE_OWNERSHIP_INVENTORY.md` as the baseline and add a compact repository map: owner, inputs, outputs, write boundary, callers, and source-of-truth/projection status.
- For each proposed merge, record which semantics must stay unchanged: workplace scoping, deleted rows, status sets, ordering, missing-record behavior, chunking, audit, and after-commit rebuild effects.
- Treat the present journal persistence path, import publication, and rebuild ownership as constraints, not opportunities to add a generic framework.

**Exit condition**

Every planned consolidation has named callers and a written compatibility contract. No implementation starts from class-name similarity alone.

**Completed:** [`REPOSITORY_MAP.md`](./REPOSITORY_MAP.md) records owners, inputs/outputs, write boundaries, caller groups, source-of-truth versus projection status, and preserved query/write semantics.

### Phase 1 — Consolidate journal read and write contracts

**Completed work**

- Ordinary journal fetch/list operations share one typed query repository; callers import it directly, with no list alias module or timeline re-export barrel.
- `JournalObserveQueries`, `JournalEnrichmentQueries`, `SmsJournalQueries`, `JournalPlannedQueries`, and balance-line queries remain specialized where their reactive or domain projections differ.
- Journal line and metadata input types are shared between `CreateJournalData` and the persistence full-write input; `PutJournalPatchInput` remains sparse and intentional.
- The aggregate boundary is explicit: transaction rows are journal legs, and their lifecycle follows journal persistence. The one-session journal path and audit/rebuild result are preserved.

**Exit condition — met**

There is one ordinary journal query entry point; specialized projections remain explicit; callers cannot accidentally create or update transaction legs independently; patch behavior and post-commit rebuild impact are unchanged.

### Phase 2 — Unify transaction and account query mechanics

**Work**

- Extract bounded ID chunk execution from repeated transaction lookups. Apply it to `findByIds` and `findByJournals` only after defining result-order guarantees.
- Represent repeated transaction predicates with typed criteria where callers genuinely share active/deleted/workplace behavior. Preserve budget joins, account/date aggregation, and specialized reactive projections as named operations.
- Define a small `AccountFilter` or equivalent for the overlap between account fetch and observe clauses. Use one clause builder while keeping fetch and observable APIs separate, including each observer’s `observeWithColumns` contract.
- Align not-found/error behavior for account and transaction lookups. Keep deliberate missing-row return values; allow unexpected query failures to propagate or be logged at the boundary.

**Exit condition**

Repeated filters and chunking have one implementation with documented ordering and scope; specialized query behavior has not been hidden behind dozens of optional flags.

### Phase 3 — Make account writes predictable

**Work**

- Define an `AccountMutationPlan` contract (name may change) that carries validated, normalized account changes and any audit/rebuild impact needed for commit.
- Route simple update/delete/recover and batch/hierarchy mutations through a consistent repository-owned preparation and commit path. Preserve domain workflow ownership for hierarchy invariants and cross-entity operations.
- Decide explicitly where `AccountingWriteSession` is needed and where `persistBatch` remains sufficient. Do not nest writers or keep two competing paths for the same accounting invariant.
- Replace loosely shaped `extraOps` callbacks with named typed contributions when they represent recurring operations such as audit or related-row updates. Keep a callback only when it is local and easier to reason about.
- Return commit facts needed by callers instead of making them infer which accounts require rebuild or which effects should run.

**Exit condition**

Account callers use a small set of documented mutation paths; the write and audit boundary is explicit; hierarchy, merge, workplace, and after-commit behavior remains owned by the right workflow.

**Risk to control**

Account changes can affect journal validity and derived balances. Keep normalization and ownership checks close to persistence, and do not move hierarchy rules into a generic CRUD helper.

### Phase 4 — Narrow raw SQL ownership

**Work**

- Introduce or designate a small `RawSqlExecutor` for adapter access, arguments, and row normalization.
- Move callers of `TransactionRawRepository.queryRaw` to named, typed methods owned by their feature query module (for example account metrics, journal enrichment, or transaction pattern queries).
- Keep transaction SQL grouped by purpose—metrics, rebuild, and patterns—without recreating one broad facade that merely forwards every method.
- Preserve workplace predicates and active-status semantics in every SQL query. Clearly mark any query that intentionally bypasses WatermelonDB model APIs.

**Exit condition**

Feature callers cannot issue arbitrary SQL through a general transaction repository; each raw query has an owning module, a typed result, and explicit scope.

### Phase 5 — Normalize ordinary entity CRUD selectively

**Work**

- Inventory existing Budget, PlannedPayment, TransactionAutoPostRule, Currency, and ExchangeRate operations and their consumers.
- For each entity, add or normalize only the CRUD operations callers actually need, with typed create/update inputs, workplace scope, and explicit deletion semantics.
- Keep schedule occurrence, inbox link/auto-post, budget execution, and conversion orchestration in feature workflows.
- Keep snapshots, running balances, audit rows, import publication, and database reset out of a generic CRUD surface.

**Exit condition**

Each ordinary entity has a predictable place to find its local reads and writes, and no table receives CRUD methods that bypass its real lifecycle rules.

### Phase 6 — Remove redundant surface area and document the map

**Work**

- Search callers after each consolidation; remove superseded wrappers, aliases, duplicate clause builders, and unused repository methods.
- Keep public barrels narrow and feature/domain-owned. Avoid a top-level barrel that makes every persistence implementation a general dependency.
- Update the ownership inventory with the final repository map and record any intentional exceptions: raw SQL modules, import writers, projection writers, and specialized observers.
- Add or retain architecture checks for direct persistence access and repository dependency direction where those checks already exist.

**Exit condition**

Every persistence path has an owner, no dead compatibility path remains, and the inventory and architecture checks agree with the implementation.

## Review gates for every phase

Before merging a phase, review the affected operations against these contracts:

- workplace scoping is mandatory for workplace-owned records;
- active, planned, reversed, deleted, and recovered records retain their intended inclusion rules;
- ordering and pagination are deterministic where the UI or accounting result depends on them;
- multi-record accounting writes remain atomic, including required audit rows;
- rebuild, cache, and analytics effects occur after durable commit;
- raw SQL retains the same scope and source-of-truth assumptions;
- public inputs remain plain typed data and cannot mutate persisted models behind the repository;
- old APIs are removed only after all in-repository callers have migrated.

Verification is phase-specific: targeted repository/workflow checks, architecture boundaries, type checking, lint, and the project’s full verification command before the complete refactor lands. Native SQLite/JSI behavior remains a separate device-level proof point already called out in the persistence inventory.

Phase 1 delivered sequential ID-query chunking shared by journal and transaction readers, shared journal line/metadata/full-write input types, and one owner for ordinary journal fetch/list queries. All in-repository callers now use owning modules directly; the compatibility aliases and re-export barrel have been removed. The review gates above apply to this work and each subsequent phase.

## Completion record

All roadmap phases are implemented in this PR:

- **Phase 0:** Added the repository map and recorded the semantic contracts governing each consolidation.
- **Phase 1:** Canonical journal query/persistence interfaces and typed write inputs; redundant reexports and aliases removed.
- **Phase 2:** Shared account filter construction, bounded transaction/journal fetch utility with ordering contract, and scoped missing/error semantics for account, transaction and journal lookups.
- **Phase 3:** Account mutation plans, typed audit contributions and commit facts; update/delete/recover and hierarchy/archive paths use the accounting write session.
- **Phase 4:** Removed `TransactionRawRepository`; moved raw SQL ownership into named typed feature query modules behind `RawSqlExecutor`; added a guard against direct production raw-SQL calls and facade reintroduction.
- **Phase 5:** Normalized only needed entity inputs and APIs for budgets, planned payments, auto-post rules, currencies and exchange rates. Schedule occurrence writes remain workflow-owned; global reference/cache data remains unscoped by workplace by design.
- **Phase 6:** Removed obsolete callers/wrappers and updated this map/inventory. Existing repository dependency and direct-persistence checks remain active.

Verification on 2026-09-29: architecture checks, privacy-policy check, and TypeScript checks passed; `test:ci` passed 415 suites and 2,517 tests; lint had zero errors and two existing warnings in untouched journal-editor/suggestions hooks. Detox execution was excluded at the user's direction. Device-level WatermelonDB/SQLite proof remains the separate open item recorded in the persistence inventory.

## Explicit non-goals

- No universal `Repository<T>` or generic `create/read/update/delete` base class.
- No single query object with many unrelated optional fields.
- No merging of all journal, transaction, raw SQL, or account classes into one large module.
- No independently mutable transaction-leg API.
- No general-purpose CRUD over audit records or derived balances.
- No new transaction coordinator solely for architectural symmetry; add one only for a concrete invariant that currently lacks one.
- No expansion of `TransactionRawRepository` into the catch-all persistence facade.

## Direction in one sentence

Standardize the simple cases, name the complex cases, and share only the mechanics whose behavior is truly the same.
