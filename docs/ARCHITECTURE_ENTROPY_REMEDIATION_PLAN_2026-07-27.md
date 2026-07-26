# Architecture Entropy Remediation Plan — 2026-07-27

## Problem statement

The accounting core is strong, but complexity is expanding at application seams. Command ownership is split between feature hooks and domain modules; broad repository façades invite unrelated behaviour; services expose UI-shaped contracts; and a few orchestration modules are absorbing cache, I/O, calculation, and persistence policies together.

This plan addresses every P0–P2 finding in the accompanying architecture entropy audit. It is deliberately a sequence of small, working commits, not a staffing or delivery plan. Each commit must leave the app type-safe, lint-clean, and behaviourally covered before the next begins.

## Target architecture

1. Domain commands own every state transition and its required side effects. Feature hooks create inputs, invoke commands, and hold only screen-local state.
2. Read modules return domain-owned DTOs. Features adapt them to component props. No service or data module imports UI or hook types.
3. Persistence is accessed through narrow intent modules, not one repository per data model with an ever-growing method list.
4. External import data becomes a typed canonical import exactly once before persistence.
5. Safe-to-Spend retains one public workplace handle while its input acquisition, projection, and snapshot persistence become separate internal responsibilities.
6. Account, report, and editor modules are split by meaningful use case or state transition—not by file size or JSX section.
7. CI enforces the dependency direction and steadily reduces unsafe type escapes.

## Decisions

- Keep the current deep modules: simulation engines, `Simulator`, `FlowResolver`, raw transaction SQL, import plugins, balance calculation, and transaction-ingestion pipeline.
- Keep `SafeToSpendReadModel.forWorkplace(id).watch()/watchHeadline()/preWarm()` as the sole external Safe-to-Spend interface. Do not recreate a NotificationService façade.
- Keep import plugins as format adapters. Their shared output becomes `CanonicalImport`; do not introduce a generic pipeline framework.
- Use ports only at real external seams. Internal collaborators stay concrete modules with narrow interfaces; test adapters alone do not justify a production port.
- Treat query reads differently from commands: features may consume narrowly scoped reactive read modules, but production feature code must not mutate repositories directly.
- Migrate and delete compatibility façades. Do not leave an old broad repository as a permanent re-export layer.
- Test through module interfaces and remove tests whose only purpose was to verify a deleted pass-through.

## Commit plan

### Foundation and baseline

1. **Make the verification baseline green.**
   - Remove the unused E2E and Safe-to-Spend imports currently reported by TypeScript.
   - Correct the incomplete account fixture, the missing journal-mode prop, and branded-ID/transaction-enum test fixtures.
   - Run typecheck and the affected test suites.
   - Acceptance: `bun run typecheck` passes without changing runtime behaviour.

2. **Record the architecture guardrail policy.**
   - Add the target dependency direction and command-ownership rules to the contributor conventions.
   - State that repositories are persistence adapters, feature hooks cannot mutate them directly, and UI types may not be imported by services or data modules.
   - Mark old architecture audit recommendations as historical where the implementation has already changed; correct Safe-to-Spend ownership in test-coverage documentation.
   - Acceptance: one current source of truth describes Safe-to-Spend ownership and the new rules.

### P0: planned-payment command ownership

3. **Characterize planned-payment lifecycle outcomes at one seam.**
   - Add behaviour tests for create, schedule-changing update, non-schedule update, delete, pause/resume, post, and skip.
   - Each test asserts persisted payment state, generated/planned journal state, next occurrence, and rebuild/invalidation behaviour where applicable.
   - Reuse the existing planned-payment service test setup; do not mock internal recurrence helpers.
   - Acceptance: the suite describes the lifecycle callers need, including the difference between schedule-changing and non-schedule edits.

4. **Introduce typed planned-payment command inputs.**
   - Define stable create and update input DTOs that contain only caller-owned form data.
   - Move first-occurrence and schedule-change detection behind the command interface.
   - Keep existing public operations unchanged in this commit.
   - Acceptance: recurrence and schedule-change policy has one typed home, with direct unit coverage.

5. **Add a create command to the planned-payment module.**
   - Implement create, initial occurrence calculation, active status assignment, due-payment processing, and required post-write effects behind one command.
   - Test only through the new command interface.
   - Acceptance: no caller needs to know that a new payment requires immediate journal generation.

6. **Add an update command to the planned-payment module.**
   - Implement update and next-occurrence policy behind one command.
   - Explicitly encode whether a schedule change regenerates, reconciles, or leaves existing future planned journals intact; select the existing product behaviour and lock it with tests before migration.
   - Acceptance: form callers do not compare recurrence fields or update repository records themselves.

7. **Add a delete command to the planned-payment module.**
   - Move deletion and all required linked-journal, audit, cache, and rebuild effects behind the command interface.
   - Add lifecycle tests for deletion of active, paused, and journal-linked payments.
   - Acceptance: there is no production direct repository delete for planned payments.

8. **Migrate the planned-payment form hook.**
   - Replace direct repository mutation and local recurrence calculation with create/update command calls.
   - Keep screen validation, loading state, navigation, and analytics presentation-local.
   - Acceptance: the hook has no mutation dependency on the planned-payment repository.

9. **Migrate the planned-payment details hook.**
   - Replace direct deletion with the delete command.
   - Keep reactive item/history reads local or move them to an existing narrow read module only if that removes duplication.
   - Acceptance: every production planned-payment mutation enters through the command interface.

10. **Remove obsolete command escape hatches and update tests.**
    - Delete or make internal any repository methods that were exposed solely for former UI command paths.
    - Delete pass-through tests; retain lifecycle tests at the planned-payment command interface.
    - Acceptance: a repository search finds no feature-layer planned-payment mutation calls.

### P1: restore domain-to-UI dependency direction

11. **Define domain-owned journal timeline DTOs.**
    - Create domain/read-model types for journal timeline items, account badges, display chrome, and date ranges.
    - Do not reuse component prop or hook types; describe accounting/display meaning independent of a specific card.
    - Add conversion tests that cover income, expense, transfer, multi-account, and ledger-row cases.
    - Acceptance: services can return timeline data without importing UI or hook modules.

12. **Move journal-card adaptation to the journal feature.**
    - Relocate component-prop construction from accounting services to a feature presentation adapter.
    - Keep rendering unchanged and migrate all journal-card consumers.
    - Acceptance: transaction-card prop types are referenced only by UI/feature code.

13. **Move account-badge adaptation to the feature presentation layer.**
    - Make accounting code return domain badges; map them to card badges beside the card adapter.
    - Preserve labels, icon fallbacks, source/destination prefixes, and overflow behaviour with focused tests.
    - Acceptance: the accounting module no longer imports `TransactionCard` types.

14. **Decouple timeline query ranges from pagination hooks.**
    - Move range definitions to the journal/ledger read model or define a small domain range DTO.
    - Update the pagination hook to adapt its inputs at the feature boundary.
    - Acceptance: journal observer and ledger display modules import neither hooks nor components.

15. **Enforce the dependency direction.**
    - Add lint restrictions preventing services/data from importing features, components, or hooks.
    - Add a focused lint fixture or static check covering the four formerly violating modules.
    - Acceptance: a new reverse dependency fails CI rather than silently becoming precedent.

### P0/P1: replace broad journal repository access with intent modules

16. **Inventory JournalRepository callers by intent.**
    - Categorize every caller as timeline/read, write, planned-journal scheduling, SMS deduplication, metadata, reversal, or enrichment.
    - Add no code behaviour in this commit; use the inventory to set the migration order and identify methods with no production caller.
    - Acceptance: every public repository method has one intent, live callers, and a nominated destination module.

17. **Expose a narrow journal write module.**
    - Promote the existing write implementation behind one write-oriented interface that owns atomic journal/transaction persistence and reversal operations.
    - Migrate journal command callers and preserve integration tests for balanced writes, updates, reversal, and soft deletion.
    - Acceptance: journal writers do not depend on read, SMS, or metadata methods.

18. **Expose a narrow journal timeline module.**
    - Group list, by-id, timeline observation, and enrichment reads under one read interface.
    - Migrate UI/read-model callers, retaining observable behaviour and query performance.
    - Acceptance: timeline consumers do not depend on persistence or scheduled-journal operations.

19. **Expose planned-journal and SMS-deduplication modules.**
    - Keep planned-payment scheduling queries and SMS fingerprint/original-ID lookups separate because they change for unrelated reasons.
    - Migrate planned-payment and ingestion callers respectively, with existing integration tests moved to the appropriate interface.
    - Acceptance: adding an SMS lookup cannot enlarge the planned-journal interface.

20. **Expose a narrow journal metadata module.**
    - Move metadata lookup and patch operations behind their own interface.
    - Migrate audit/ingestion callers and test partial patch semantics.
    - Acceptance: metadata shape changes do not affect the journal write or timeline interfaces.

21. **Delete the JournalRepository compatibility façade.**
    - Remove unneeded forwarding methods as each intent module reaches zero façade consumers.
    - Delete the façade only after all production callers migrate; do not keep an index that recreates the 39-method interface.
    - Acceptance: no module can import the former all-purpose journal repository.

22. **Repeat the intent inventory for account and transaction repositories.**
    - Identify only existing coherent clusters; do not pre-emptively split every method.
    - Prioritize clusters already shared by account commands, reports, simulation, and ingestion.
    - Acceptance: the next extraction is justified by change locality and caller intent, not raw method count.

### P1: harden the import boundary and collapse import indirection

23. **Delete the `ImportRunner` pass-through.**
    - Migrate its callers directly to the import application module and remove its tests, if any only assert delegation.
    - Acceptance: no new module exists solely to call `executeImport`.

24. **Characterize the import workflow as observable behaviour.**
    - Add tests for phase order, progress monotonicity, backup-before-mutation, staging cleanup on failure, integrity-before-swap, post-swap rebuild, preferences restoration, and non-fatal rate-sync/rebuild failures.
    - Continue testing through the import application interface rather than private helper calls.
    - Acceptance: the current nine-phase safety contract is explicit.

25. **Introduce `CanonicalImport` as the sole plugin output.**
    - Define a versioned discriminated DTO for accounts, journals, transactions, metadata, budgets, planned payments, inbox data, and import metadata.
    - Make the contract distinguish absent optional data from malformed data and represent canonical enum/ID/currency values precisely.
    - Acceptance: every plugin has one typed output and no caller receives raw format data.

26. **Normalize native import output at the plugin seam.**
    - Move legacy casing and version compatibility into the native plugin adapter.
    - Validate there and return canonical data; preserve legacy fixture coverage.
    - Acceptance: native compatibility logic does not reach import persistence.

27. **Normalize Ivy and Cashew outputs at their plugin seams.**
    - Migrate one plugin per commit, retaining its format-specific tests (currency, transfers, planned transactions, categories, and opening-balance cases).
    - Acceptance: all plugin contracts return the same canonical DTO despite different source formats.

28. **Make validation consume canonical imports only.**
    - Consolidate structural validation and accounting invariants at the canonical seam.
    - Reject malformed data before staging and ensure errors name the offending canonical record.
    - Acceptance: persistence never receives unvalidated raw plugin shapes.

29. **Make batch import persistence fully typed.**
    - Replace permissive imported record shapes, `any`, and stringly enum coercion in the import repository with canonical records.
    - Isolate any necessary Watermelon collection typing behind a small local adapter and remove `any` from the import application workflow.
    - Acceptance: the import write path has no production `any`/unsafe cast except a documented, locally contained database adapter assertion.

30. **Represent import execution as named phases and one run state.**
    - Replace locally scattered progress percentage handling with a typed `ImportRun` state that names phase, progress, message, and recoverable/non-recoverable result.
    - Keep the application module concrete; do not introduce a generic pipeline abstraction.
    - Acceptance: progress and cleanup policy are testable without duplicating percentages across workflow code.

### P1: narrow Safe-to-Spend implementation responsibilities

31. **Add Safe-to-Spend characterization tests at the public handle.**
    - Cover cache reuse/eviction, workplace currency switch, headline projection, zero-liquid-assets fallback, errors, snapshot-write failure, and preference-window changes.
    - Preserve current simulation tests as the engine contract; do not duplicate them at the read-model level.
    - Acceptance: callers can trust the public handle while internals move.

32. **Introduce a typed Safe-to-Spend input snapshot.**
    - Define the fully resolved inputs required for calculation and presentation history: accounts, budgets, usages, planned data, balances, historical deltas, currencies, and settings.
    - Keep this type internal to the Safe-to-Spend module.
    - Acceptance: the projection phase no longer knows how database observables or preferences are sourced.

33. **Extract input observation and acquisition.**
    - Move preference observation, reactive sources, raw-history fetching, FX warming, balance reads, and budget usage collection into a concrete input module.
    - Preserve debounce, cancellation, currency changes, and error semantics with the new public-handle tests.
    - Acceptance: one module owns data freshness and input assembly; it returns the typed input snapshot.

34. **Extract projection assembly.**
    - Move simulation invocation, history/projection construction, safe-day calculation, and dashboard assembly into a projection module consuming the input snapshot.
    - Keep `CashFlowSimulationService` unchanged except for receiving its existing typed input.
    - Acceptance: projection can be tested from a fixed input snapshot without database or observable setup.

35. **Extract snapshot persistence as a post-projection effect.**
    - Move durable snapshot saving out of the calculation stream into a small writer invoked after a successful projection.
    - Preserve non-fatal write failure behaviour.
    - Acceptance: persistence cannot alter calculation output or turn a successful projection into an error.

36. **Reassemble the existing Safe-to-Spend handle and delete transitional paths.**
    - Make the read model compose inputs, projection, cache policy, and snapshot writer behind its unchanged public interface.
    - Remove tests that target superseded private implementation seams.
    - Acceptance: dashboard, widget, and bootstrap callers retain their interface while each implementation responsibility has one owner.

### P2: split account lifecycle by use case

37. **Characterize account command outcomes.**
    - Add interface-level tests for creation with initial balance, parent/hierarchy validation, metadata, merge, adjustment, and reconciliation/repair paths.
    - Assert transactions, audit records, dependent budget/planned-payment/rule changes, and rebuild invalidation where relevant.
    - Acceptance: existing account service behaviour is protected before extraction.

38. **Extract the account rule module.**
    - Move pure hierarchy, account-type, subtype, and initial-balance invariants into one in-process module.
    - Do not include I/O or analytics.
    - Acceptance: all account use cases share one tested rule vocabulary without becoming a catch-all service.

39. **Extract account creation as a command module.**
    - Move account creation, parent validation, metadata, opening balance, audit, and rebuild effects behind one command interface.
    - Migrate creation callers and integration tests.
    - Acceptance: no UI caller coordinates initial balance and audit policy.

40. **Extract account hierarchy update as a command module.**
    - Move parent/reorder/hierarchy invariants and downstream effects from the broad account module.
    - Acceptance: hierarchy changes have one owner and tests do not require unrelated merge setup.

41. **Extract merge and balance-adjustment commands separately.**
    - Migrate one use case at a time; preserve transactions across dependent budgets, planned payments, rules, snapshots, and rebuild queues.
    - Acceptance: merge and adjustment concerns do not expand creation or hierarchy interfaces.

42. **Delete the broad AccountService façade.**
    - Remove transitional forwarding methods once all command callers are migrated.
    - Keep only a small account read/query interface if it has a coherent independent consumer set.
    - Acceptance: account changes select a use case by intent rather than calling a generic lifecycle gateway.

### P2: reduce report and feature view-model expansion

43. **Define a chart-neutral report snapshot contract.**
    - Stabilize a report-screen snapshot containing only the report data the feature needs.
    - Keep calculators as internal implementations and preserve independently refreshed data only where the product demonstrably requires it.
    - Acceptance: chart components do not import report-service presentation types.

44. **Migrate report feature adapters and shrink ReportService surface.**
    - Adapt the snapshot to each chart in the reports feature.
    - Consolidate redundant public/reactive mirror methods behind the snapshot; retain specialized queries only where they still have distinct consumers.
    - Acceptance: adding a visualization normally changes a feature adapter, not the report module interface.

45. **Extract journal editor state transitions.**
    - Identify create/edit/load/save transitions shared by simple, bulk, and advanced editor paths.
    - Move only deterministic state and validation policy to an editor-state module; retain gestures and local form rendering in hooks.
    - Acceptance: editor hooks no longer duplicate ledger validation or transition rules.

46. **Extract account form and account details decisions.**
    - Move validation, load/transform, and command invocation decisions into focused modules one concern at a time.
    - Keep data subscriptions, navigation, and display formatting in view models.
    - Acceptance: the account form/details hooks become composition layers rather than competing domain owners.

47. **Extract SMS-rule policy from the form view model.**
    - Move structured-versus-legacy matching, regex validation, and preview inputs into a rule-policy module.
    - Keep field state and screen interactions in the hook.
    - Acceptance: SMS rule policy is reusable and tested without React setup.

48. **Remove obsolete duplicated presentation and helper paths.**
    - Audit every migrated cluster for stale re-exports, compatibility aliases, duplicated mappers, and tests that only assert delegation.
    - Delete them in small, behaviour-preserving commits.
    - Acceptance: there is one intended import path for each surviving module interface.

### Guardrails and completion

49. **Add command-mutation lint enforcement.**
    - Restrict repository mutation methods from feature production code while allowing approved narrow reactive reads.
    - Add explicit exceptions only when a true local adapter is justified and document them beside the rule.
    - Acceptance: a direct feature `create`, `update`, or `delete` through a repository fails lint.

50. **Add an unsafe-type ratchet.**
    - Start with an explicit production baseline for `any`, `unknown`, and casts, excluding tests and generated/native integration code.
    - Block increases globally and require decreases in import/persistence modules until their target is reached.
    - Acceptance: type erosion cannot grow unnoticed.

51. **Add repository-interface growth checks.**
    - Prevent new public methods on deleted or migration-only façades.
    - Require a named intent module and an interface-level test for any new persistence capability.
    - Acceptance: the repository gateway pattern cannot reappear under a new name.

52. **Finalize documentation and verify the whole repository.**
    - Update architecture, conventions, test-coverage, and the entropy audit with completion status and the surviving module map.
    - Run typecheck, lint, unit/integration suite, relevant E2E journeys, and the full verification command.
    - Acceptance: all verification passes; no P0–P2 audit finding remains open; documentation matches the code.

## Testing decisions

- Test state transitions through command interfaces: planned-payment lifecycle, account creation/hierarchy/merge/adjustment, and journal writes.
- Test read contracts through observable or snapshot interfaces: Safe-to-Spend handle, report snapshot, journal timeline, and import workflow.
- Test import adapters with representative source-format fixtures, then test the canonical validation and persistence contracts independently.
- Retain existing simulation engine and raw-SQL tests as implementation-level protection where financial calculations require it; do not duplicate engine cases in UI/read-model tests.
- Use integration tests for transactionality, staged import recovery, linked journals, and cache/rebuild effects. Use unit tests for pure recurrence, state, mapping, and policy rules.
- Delete delegation tests once their pass-through module is deleted. No test should assert private collaborator calls merely because a module was split.

## Out of scope

- Rewriting the simulation engine, balance service, raw SQL performance paths, import-plugin model, or transaction-ingestion pipeline.
- Introducing a generic workflow/pipeline framework, event bus, repository base class, or ports with only one real adapter.
- Redesigning UI, changing product behaviour, changing database schema, or changing accounting invariants except where a current invariant is made explicit and covered.
- Splitting modules merely to meet a line-count target.
- Worker allocation, time estimates, release planning, or publishing a GitHub issue.

## Completion definition

The remediation is complete when feature code invokes domain commands rather than mutating repositories; services/data have no UI/hook dependencies; journal and account persistence are accessed by intent; imports cross one typed canonical seam; Safe-to-Spend retains its small public interface with separated internal responsibilities; report/editor/account modules each have one coherent change axis; documentation is current; and CI prevents the old expansion patterns from returning.
