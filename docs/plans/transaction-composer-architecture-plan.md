# Transaction Composer Architecture Plan

Status: in progress

## Implementation ledger

Completed:

- Added pure `TransactionIntent` → `PostingPlan` resolution and posting-plan validation.
- Added a typed launch-seed adapter while preserving legacy journal-entry URLs and launchers.
- Prevented stale in-flight suggestion requests from overwriting refreshed cache data.
- Moved Split and Bulk draft/controller ownership into the journal-entry shell, so panels are
  presentation surfaces rather than durable state owners.
- Removed the imperative mode registry; panels are presentation/editing surfaces, while submit
  validation, labels, and account-picker actions are explicit shell/session operations.
- Bounded suggestions by current description, visible-result limit, three-month policy, and
  workplace/query/version cache keys.
- Guarded suggestion state writes by the active workplace and query, so a late prior query
  cannot mark the current query loaded or replace its result set.
- Replaced the permanent four-tab presentation with a detail-level disclosure control and added
  an isolated Batch workspace route.
- Redirected legacy bulk entry URLs to the Batch workspace and removed Bulk from the single-
  transaction shell.
- Returned single-transaction views to lazy mounting now that their drafts are shell-owned.
- Removed the mode snapshot transition state machine; switching detail levels now changes the
  active projection without parking or rebuilding editor lines.
- Added an explicit composer session boundary that owns the editor, Split draft, editable intent,
  derived posting plan, and posting-plan validation.
- Routed single-transaction editor saves through `postPostingPlan`, which validates the current
  account snapshot and posting plan before delegating to journal persistence.
- Moved footer submission into the composer session; panels now expose validation and account
  selection only, while Split line assembly also runs through the session.
- Replaced internal presentation-mode names with `basic`, `allocation`, and `expert`; legacy
  route values remain confined to the compatibility adapter.
- Verified the full Jest suite after the composer changes: 280 suites passed, with 1,687 tests
  passing and 1 skipped; added coverage for all supported launch contexts, late suggestion
  responses, oversized suggestion results, and session-owned Split submission.
- Added a 10,000-line posting-plan validation guard; the current implementation completed it in
  17ms in the Jest harness.
- Verified typecheck, lint, E2E typecheck, and all architecture ratchets; the repository’s
  performance audit remains the source of truth that device/runtime traces are unavailable.
- Updated the browser transaction fixtures for the disclosure control and Batch route; the
  expense creation smoke passed in the web harness.
- Added a browser cold/warm composer probe; the observed run was 221ms cold and 116ms warm.
  These are web-harness observations, not universal device-performance claims.
- Virtualized the native isolated Batch row workspace with `FlashList`, removing the previous
  uncapped `ScrollView` mount cost for large batches; the web harness keeps a `ScrollView`
  fallback because calculator sheets mounted inside virtualized rows are not stable in RN web.
- Removed the panel-to-shell submit-state channel; the footer now derives its state directly
  from session-owned posting-plan and allocation validation.
- Attempted a release-like iOS simulator composer probe: the native Release build succeeded,
  but Detox could not connect its localhost synchronization socket (`:52374`), so no native
  composer timing was recorded and the probe was not kept as a CI test.

Next:

- Capture release-like native/device traces for cold/warm composer load and large journal
  datasets when that runtime is available.

Measurement note: this item requires a release-like device/browser run. The existing
`docs/audits/ui-performance-memo-2026-08-25.md` records the exact workloads and prohibits making
FPS, latency, memory, or TTI claims from static analysis alone. The web probe is complete; the
native attempt is currently blocked by the Detox synchronization runtime rather than by a
measured composer result.

## Decision

Replace the journal-entry mode model with a transaction-composer model.

The user records a money movement. The application resolves that intent into accounting
postings. The persisted journal remains the accounting and audit representation, not the
primary user-facing workflow.

```text
User intent → Posting plan → Posted journal
```

This is a structural redesign, not a visual refresh. Do not extend the existing
Simple/Split/Advanced synchronization model.

## Why the current model must change

The current page exposes four competing workflows:

- Simple/Guided and Advanced share editor lines.
- Split owns a separate local draft.
- Bulk owns another local draft.
- Mode switching uses snapshots and an imperative mode registry.
- Route parameters carry partial transaction state from many entry points.

This creates duplicated state ownership, destructive remount behavior, complicated save
coordination, and an accounting-shaped UX.

The known correctness risk is that Split and Bulk drafts can disappear when their panels are
unmounted. Amount carry-over has been fixed, but amount synchronization is treating the symptom;
the draft itself needs one owner.

## Target product model

The page is a transaction composer with progressive disclosure:

```text
Capture
  amount, description, date, likely accounts

Review
  resolved accounts, type, currency, validation

Expand
  split allocation, notes, detailed posting lines

Post
  one persistence command
```

There are no permanent user-facing mode tabs.

Simple, Split, and Advanced become presentation levels over the same draft:

- Basic: exactly two posting lines.
- Allocation: one source and multiple destination/category lines.
- Expert: unrestricted posting-line editor.

Bulk is a separate batch workspace. It is not a more advanced version of one transaction.

## Domain model

Introduce explicit domain types. Names may change during implementation, but the boundaries are
mandatory.

```ts
type TransactionIntent = {
  description: string;
  amount?: string;
  date: string;
  notes?: string;
  type?: 'expense' | 'income' | 'transfer';
  sourceAccountId?: AccountId;
  destinationAccountId?: AccountId;
  allocations?: TransactionAllocation[];
  sourceContext?: TransactionSourceContext;
};

type PostingPlan = {
  lines: JournalEntryLine[];
  currencyCode: string;
  description: string;
  date: number;
  notes?: string;
};

type PostedJournal = {
  journalId: JournalId;
  plan: PostingPlan;
};
```

Responsibilities:

- `TransactionIntent`: user-facing, incomplete, editable state.
- `PostingPlan`: validated accounting result.
- `PostedJournal`: persisted result and audit identity.
- Resolver: converts intent to postings and reports unresolved decisions.
- Validator: verifies structure, accounts, currencies, and balance.
- Command service: persists one validated plan and owns post-save side effects.

## Unified entry-point contract

Every launcher produces the same intent or intent seed:

```text
Dashboard / account / SMS / widget / voice / duplicate / edit
  ↓
TransactionIntentSeed
  ↓
TransactionComposerSession
```

The route should stop carrying a growing list of loosely related fields. During migration,
legacy route parameters are parsed at one boundary and immediately converted into the intent
seed. New callers use a typed builder.

Entry-point context must remain explicit:

- originating screen
- workplace
- preselected accounts
- imported metadata
- edit/duplicate identity
- date and amount hints

The composer owns interpretation after that boundary.

## State ownership

Create one session owner for a single transaction:

```text
useTransactionComposerSession
  ├── intent
  ├── derived posting plan
  ├── unresolved decisions
  ├── validation state
  ├── loading state
  ├── submitting state
  └── error state
```

All entry surfaces read and mutate this session. No mode panel may own durable draft state.

Transient UI state may remain local:

- focused field
- open picker
- expanded section
- keyboard visibility
- suggestion popup visibility

The session must own anything that changes the transaction or affects save validity.

## UI structure

Target component structure:

```text
TransactionComposerScreen
  ├── ComposerHeader
  ├── TransactionCapture
  ├── TransactionReview
  ├── TransactionAllocation (optional)
  ├── PostingLineEditor (optional)
  ├── Suggestions
  └── ComposerFooter
```

The screen orchestrates. It does not perform persistence, accounting calculations, or route
normalization.

The footer submits the session's validated posting plan. It does not discover an active panel
through `ModeHandleContext`.

## Suggestions and inference

Suggestions become a general composer capability, not a journal-specific popup.

Pipeline:

```text
description / voice / SMS context
  ↓
candidate suggestions
  ↓
intent enrichment
  ↓
user confirmation
  ↓
posting-plan resolution
```

The data layer must query only the candidates needed for the current input. Do not load and
enrich 500 descriptions before filtering in the UI.

Requirements:

- three-month lookback remains the default policy;
- query accepts search input and a visible-result limit;
- account enrichment is bounded to visible candidates;
- cache entries are workplace-scoped and versioned;
- stale in-flight requests cannot repopulate a newer cache;
- loading, empty, and error states are distinguishable.

## Persistence boundary

Create one command path:

```text
composer submit
  ↓
resolve intent
  ↓
validate posting plan
  ↓
persist journal + transactions + metadata atomically
  ↓
run post-commit effects
```

Post-commit effects include SMS processing, analytics, and navigation. They must not be mixed
into the accounting transformation.

Existing `journalDomainService` responsibilities should be split as the new command path lands:

- transaction command orchestration;
- journal read model access;
- suggestion query/cache;
- external integrations.

## Migration phases

### Phase 0: Contract and measurement

- Add the domain types and state-transition diagrams.
- Inventory all current entry launchers and route fields.
- Capture current behavior for create, edit, duplicate, SMS, widget, voice, split, advanced,
  and bulk flows.
- Add performance measurements for cold and warm composer load.
- Add a failing regression test for Split/Bulk draft loss on unmount/remount.

Exit criteria:

- all launchers map to a documented intent seed;
- current behavior is covered before replacing the UI;
- no implementation decision depends on assumed mode behavior.

### Phase 1: Introduce the intent boundary

- Add `TransactionIntent` and `PostingPlan`.
- Add a legacy route adapter that produces an intent seed.
- Move structural validation and posting assembly behind the new resolver.
- Keep the existing screen as a compatibility consumer.

Exit criteria:

- old and new paths produce equivalent posting plans;
- existing save tests remain green;
- route parsing is isolated to one adapter.

### Phase 2: Move draft ownership

- Add `useTransactionComposerSession`.
- Move common metadata and canonical lines into the session.
- Move Split allocation state into the session.
- Move Bulk to a separate session type and screen.
- Remove mode snapshots as a source of truth.

Exit criteria:

- switching presentation levels never loses amount, accounts, allocations, notes, or lines;
- only one state owner exists for each persisted field;
- unmount/remount tests pass.

### Phase 3: Build progressive-disclosure UI

- Replace the mode bar with Capture, Review, and optional Expand actions.
- Make allocation an expansion of the same draft.
- Make expert posting-line editing an expansion of the same draft.
- Preserve keyboard, accessibility, and account-picker behavior.
- Keep deep links compatible through the route adapter.

Exit criteria:

- the default flow requires no mode decision;
- advanced capabilities remain reachable;
- all entry contexts open the same composer screen.

### Phase 4: Simplify suggestions and inference

- Move suggestions behind the composer session.
- Make the query search-aware and bounded.
- Version cache writes and centralize invalidation.
- Represent inferred values with confidence and explicit confirmation state.
- Add visible loading, empty, and failure feedback.

Exit criteria:

- high-volume users receive bounded query work;
- suggestions never silently disappear because of a slow request;
- stale results cannot overwrite current results.

### Phase 5: Retire compatibility architecture

- Delete `ModeHandleContext` once all submission is session-driven.
- Delete mode snapshot transition logic.
- Remove legacy route-field duplication.
- Split the remaining journal service responsibilities.
- Rename user-facing journal-entry terminology where appropriate.

Exit criteria:

- no production caller depends on the old mode contract;
- the compatibility adapter is removable;
- architecture checks have no new exceptions.

## Explicit non-goals

- Do not redesign the accounting rules during the composer migration.
- Do not remove the expert posting-line editor.
- Do not merge Bulk into the single-transaction session.
- Do not add AI inference before deterministic intent and posting contracts are stable.
- Do not optimize lists or queries without measurements.
- Do not change historical journal storage semantics in the first migration.

## Required test matrix

### Intent and resolution

- blank capture;
- expense, income, and transfer;
- two-line plan;
- split allocation;
- multi-currency;
- unresolved account;
- invalid balance;
- inferred value accepted and rejected.

### Entry points

- dashboard;
- activity list;
- account page;
- SMS/import;
- widget/deep link;
- voice;
- duplicate;
- edit;
- planned payment.

### Lifecycle

- switch between disclosure levels;
- unmount/remount while draft is populated;
- workplace change;
- suggestion request resolves after cache invalidation;
- submit while another request is active;
- failed load;
- failed save;
- retry after failure.

### Performance

- empty workplace;
- 100 journals;
- 10,000 journals;
- cold suggestion load;
- warm suggestion load;
- typing during keyboard animation;
- low-end device interaction latency.

## Acceptance criteria

- One canonical transaction draft owns all single-entry state.
- No user data is lost when expanding, collapsing, or switching disclosure levels.
- Simple, allocation, and expert views produce the same posting-plan contract.
- Bulk has an isolated workflow and persistence path.
- All entry points use the typed intent seed contract.
- Suggestions are bounded, three-month scoped, cancellable/versioned, and observable.
- Save has one transaction command path with atomic persistence.
- Post-commit integrations cannot corrupt or block accounting persistence.
- The default transaction can be recorded without understanding double-entry terms.
- Expert accounting controls remain available without being the default experience.
- Unit, integration, architecture, and applicable E2E tests pass.

## Commit strategy

Use small logical commits:

1. `docs: define transaction composer contracts`
2. `test: cover legacy entry intent mapping`
3. `refactor: route journal saves through posting plans`
4. `refactor: centralize composer draft ownership`
5. `refactor: isolate bulk transaction workspace`
6. `feat: add progressive transaction composer UI`
7. `perf: bound suggestion lookup and cache writes`
8. `refactor: remove journal mode coordination`

Each commit must pass its focused tests. Do not push remotely.

## Final design test

If a user asks, “What mode should I use?”, the design has failed.

They should only need to answer:

> What happened, and how much was involved?

The application should handle the accounting representation from there.
