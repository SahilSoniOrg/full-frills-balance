# Transaction Composer Remediation Plan

Status: in progress

Progress:

- Moved shared amount reconciliation into the composer session and added async edit-hydration
  coverage for Allocation. The remaining canonical-draft work will remove this temporary bridge.
- Removed the separate Split draft store. Allocation rows now project directly from editor lines,
  so row edits, amount changes, validation, and submit all observe the same line state.
- Routed session submission through `resolveTransactionIntent` and the editor’s shared
  `submitPlan` command for Basic, Allocation, and Expert. The editor remains a UI/persistence
  adapter temporarily; the session now owns the live intent-to-plan decision.
- Removed the legacy editor `submit` adapter. The session is now the only production submit
  command for single-entry saves; the editor exposes only the persistence-facing `submitPlan`.
- Removed the dead Simple/Split save handlers, Bulk-only presentation arguments, and no-op amount
  focus callbacks. Added coverage proving the initial background suggestion query can finish while
  a later typed query is active, and fixed scheduled-load bookkeeping from being cleared by an old
  request.
- Verification: composer-focused tests, full typecheck, lint, architecture ratchets, e2e typecheck,
  and diff checks pass. The full Jest run is otherwise green (278/279 suites); the remaining
  `src/services/__tests__/sms-service.test.ts` failure is an existing order assertion that expects
  insertion order while `SmsRuleEngine.previewRuleMatches` explicitly sorts newest-first. It is
  outside this composer change and remains intentionally untouched.

This plan addresses the thermo-nuclear review of the unpushed transaction-composer work. The
original architecture plan remains the design reference:
[`transaction-composer-architecture-plan.md`](./transaction-composer-architecture-plan.md).

## Problem statement

The current implementation has good behavior coverage but still has two live models:

```text
editor.lines + splitDraft → mode-specific synchronization → save-time branching
```

The intended model is:

```text
one composer draft boundary → TransactionIntent → resolve → validate → post
```

The remediation must reduce concepts, not add another synchronization layer.

## Work plan

### Phase 1: Define the canonical draft boundary

- Establish one draft boundary containing description, date, notes, amount, accounts, and
  allocations. The editor line state is the current mutable implementation of that boundary;
  session and mode hooks must project from it rather than maintain another durable copy.
- Make Basic, Allocation, and Expert editors projections/adapters over that draft.
- Remove the shell’s enter-Allocation synchronization effect.
- Hydrate the canonical draft after async edit loads, including direct Allocation deep links.
- Add tests for amount and account preservation across every disclosure transition.

Exit criteria:

- no persisted field has two durable in-memory owners;
- direct Allocation/edit hydration is covered;
- switching views requires no reconciliation effect.

### Phase 2: Make intent resolution the live command path

- Build `TransactionIntent` from the canonical draft boundary, not from a mode-specific save
  branch.
- Resolve intent into one `PostingPlan` inside the session.
- Validate that plan once against the current account snapshot.
- Make the session submit that validated plan through `postPostingPlan`.
- Remove the editor’s independent plan construction and mode-specific save branching.

Exit criteria:

- production has one intent → plan → validation → persistence path;
- `resolveTransactionIntent` has production callers;
- allocation and non-allocation saves use the same command contract.

### Phase 3: Remove duplicate command and presentation surfaces

- Delete unused `handleSave` implementations from Simple and Split controllers.
- Remove obsolete Bulk parameters from single-entry submit policies.
- Remove no-op amount focus/blur plumbing left from the old mode registry.
- Correct stale comments and remove unused `transactionIntent` plumbing if it is not consumed.
- Keep Bulk as a separate route and command surface.

Exit criteria:

- only the session submits single transactions;
- no single-entry API accepts Bulk-only state;
- no dead save handler remains in an active single-entry projection.

### Phase 4: Simplify suggestions and measurement

- Reduce suggestion scheduling to one query lifecycle with versioned stale-result protection. The
  current service has no abort-signal contract, so completion is intentionally allowed after the
  user types again; only the latest query may update visible state.
- Move suggestion application behind the session or a narrow journal-domain command.
- Propagate cancellation through the service if the repository supports it; otherwise document the
  guarantee as versioned, not cancellable.
- Fix the browser timing probe so timing ends after composer visibility.
- Keep native Maestro smoke evidence separate from precise native performance claims.

Exit criteria:

- suggestion behavior is bounded, versioned, and honestly cancellable or explicitly versioned;
- no stale suggestion response can alter current state;
- performance probes measure the intended interval.

### Phase 5: Reframe the disclosure UI

- Verify whether Basic/Allocate/Expert should become Capture/Review/Expand projections.
- Preserve expert controls without making users choose an accounting mode.
- Keep route compatibility at the adapter boundary only.

Exit criteria:

- the default flow does not require a mode decision;
- advanced controls remain reachable;
- the terminology matches the product model.

## Verification matrix

- canonical draft hydration for create, edit, split deep link, SMS, duplicate, and planned payment;
- amount/account/description preservation across Basic → Allocation → Expert and reverse;
- intent resolution for expense, income, transfer, allocation, multi-currency, and invalid input;
- exactly one production submit command for single transactions;
- stale, cancelled, empty, error, and large suggestion queries;
- browser timing probe waits for the composer screen before stopping the timer;
- full Jest suite, typecheck, lint, E2E typecheck, architecture ratchets, browser smoke, and native
  Maestro smoke.

## Commit sequence

1. `docs: define composer remediation plan`
2. `refactor: make composer draft canonical`
3. `refactor: route saves through intent resolution`
4. `refactor: remove duplicate composer commands`
5. `perf: simplify suggestion lifecycle`
6. `test: correct composer performance probe`
7. `feat: refine composer disclosure language`

No remote push. Keep commits small and independently reviewable.
