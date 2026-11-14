# Spec — User, Device, Workplace, and Setup

**Product:** Full Frills Balance
**Date:** 2026-11-14
**Status:** Approved contract; onboarding implementation in progress
**Related:** [`CONTEXT.md`](../../../CONTEXT.md), [`docs/adr`](../../adr/), and [onboarding implementation plan](../onboarding-improvement/implementation-plan.md)

This is the canonical behavior and ownership contract. Terms follow `CONTEXT.md`. File paths and component names are intentionally excluded.

## 1. Domain ownership

| Concern                                                                                                        | Owner       |
| -------------------------------------------------------------------------------------------------------------- | ----------- |
| Display name, theme, font, privacy mask, notifications                                                         | User        |
| Device registration, app lock, Active workplace, telemetry ID, Device inbox, Device SMS listen                 | Device      |
| Journals, accounts, currency, budgets, planned payments, capture preferences, Workplace inbox copies          | Workplace   |
| Unfinished journey recipe, accepted setup outputs, limited fact provenance, operation identity                 | Setup draft |

There is no general “onboarding state.” Device registration, Workplace publication, Setup acceptance, and app-entry eligibility are different facts.

The canonical persisted launch inputs are:

- whether this Device is registered;
- the Active workplace ID, when one is selected;
- the single validated Setup draft, when a journey is unfinished;
- the Workplaces actually present in the database.

Do not persist parallel `onboardingCompleted`, `onboardingStage`, onboarding Workplace, pending Workplace, numeric step, or route-derived completion state.

## 2. Launch contract

Launch runs above books providers.

1. If a valid blocking Setup draft exists, resolve `setup(journeyId)`.
2. Otherwise discover Workplaces. Discovery has loading and failure states; failure is never treated as zero Workplaces.
3. Resolve from Device registration, Active workplace, and discovered Workplace IDs:

```text
if Device is not registered
  → blocking conversational first-run creation or first-run restore
else if no Workplaces exist
  → blocking conversational Workplace creation or empty-device restore
else if Active workplace exists in the discovered set
  → open(Active workplace)
else if exactly one Workplace exists
  → open(that Workplace) and repair Active workplace
else
  → Workplace picker
```

An optional Setup draft never blocks ordinary launch. It is offered only when the User returns to the corresponding action.

Books providers mount only for `open(workplaceId)` after that exact row is observed. Cached Workplace data, a Setup result, an import result, or a stale pointer cannot authorize books mounting.

Bare books deep links received before a valid `open` target are rejected because their Workplace is ambiguous. After a blocking journey completes, launch resolves again and lands on the opened Workplace rather than replaying the ambiguous deep link.

### 2.1 Device recovery

Existing valid Workplace rows may prove that an older or recovered install had usable books. Recovery may repair Device registration, Active workplace, and a missing display name without creating or modifying a Workplace. `User` is permitted only as this recovery name; it is never a first-run fallback.

Recovery is not a compatibility layer for any unreleased Setup draft or onboarding flag.

## 3. Setup model

Restore journeys are ordered recipes of Setup slices. The Setup Coordinator performs a linear scan from the current position:

1. ignore slices not included by the recipe;
2. auto-complete a `when_missing` slice only when all required authoritative facts are present;
3. stop at the first slice requiring presentation;
4. persist only accepted checkpoints;
5. execute a recipe-specific finisher after the terminal confirmation.

Slice participation policies are:

- **required** — must be presented and accepted;
- **when missing** — auto-complete from authoritative facts, otherwise present;
- **always show** — prefill available facts but require explicit confirmation.

Defaults may prefill a field, but never turn a required missing fact into an auto-completed slice. Conversational creation uses the sequence in section 4.0 inside the same Setup ownership boundary. Its editable input is durable before acceptance; only validated included input can reach publication.

### 3.1 Fact provenance

Provenance is retained only for facts that affect prefilling, auto-completion, or dependent derivation:

- User-entered;
- imported;
- existing;
- defaulted.

At minimum this applies to User display name, Workplace identity and required configuration, and appearance. Ordinary selections made inside Workplace setup do not need provenance wrappers.

### 3.2 Draft behavior

There is at most one active Setup draft per Device. The same device-scoped draft is
the only home for both checkpointed Setup facts and an unfinished conversational
creation session; no second setup store or onboarding-state flag is introduced.
Blocking vs optional entry context is recorded on that draft, not inferred from a
route.

The draft contains:

- journey identity and whether it blocks launch;
- stable operation identity;
- accepted slice outputs;
- limited fact provenance;
- presentation history for Back;
- a reference and fingerprint for an uncommitted Restore source, when present;
- a Restore handoff after publication, when present;
- for conversational creation, durable unaccepted editor input and deferred-step
  metadata. This input is session state owned by the single draft, not an accepted
  checkpoint and not a separate authoritative numeric draft; it survives resume
  and explicit restart handling as described in section 4.

Parsed accounts, journals, transactions, and other imported books are never serialized into the Setup draft. Before publication, a resumed restore reparses the selected source. After publication, the Workplace row and its books are authoritative.

A corrupt draft is rejected. Rejecting it never deletes published books. Normal launch recovery handles valid Workplaces; an unpublished restore returns to source selection.

## 4. Journey recipes

The four restore journeys are `first_run_restore`, `empty_device_restore`,
`picker_restore`, and `settings_restore`; all remain supported.

| Journey                                | Entry policy            | Presented order                                                                                                             |
| -------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| First run                              | Blocking                | Welcome → Currency → Accounts → Income → Payments → Monthly limits → Result                                                 |
| First-run restore                      | Blocking                | Restore source → missing publication facts → Restore summary → publication → Device setup when missing → open |
| Registered Device with zero Workplaces | Blocking                | Currency → Accounts → Income → Payments → Monthly limits → Result, or empty-device restore                                    |
| Restore from picker                    | Blocking while selected | Restore source → missing publication facts → Restore summary → Open or return to picker                                     |
| Restore from Settings                  | Optional                | Restore source → missing publication facts → Restore summary → Open or stay                                                 |
| Later Workplace creation               | Optional                | Currency → Accounts → Income → Payments → Monthly limits → Result                                                            |

Workplace replacement is maintenance, not a Setup journey. It may reuse restore parsing and validation but keeps separate confirmation and completion behavior.

### 4.0 Conversational creation surface

The conversational creation surface uses seven steps: Welcome, Currency, Accounts,
Income, Payments, Monthly limits, and Result. Welcome is uncounted and is omitted
on registered devices; the remaining six are counted progress steps. Welcome
captures a first-run name without registering the Device. First-run creation
registers and names the Device only after successful books publication, as an
idempotent follow-up. Registered-empty-device and additional-workplace creation
never register or rename the Device. Restore keeps its Device slice behavior.

Creation entry context is separate from creation intent. `first_run` and
`add_workplace` are intents; entry context may be unregistered device, registered
device with no usable Workplace, Workplace picker, or an existing-Workplace
entry. `add_workplace` is blocking in the empty-device context and optional in
picker/existing-Workplace contexts. A route parameter never overrides a blocking
restore or an incompatible unfinished draft.

Publication and activation follow the repository's publication contract: validate
the whole included payload first, publish the Workplace and included setup records
in one database transaction, then perform Device registration/name, Active
workplace, and other follow-ups as idempotent effects outside that transaction.
The Setup draft is cleared last. The launch coordinator validates and opens the
published Workplace through its normal transition path; creation surfaces never
write an active pointer or navigate around that coordinator.

### 4.1 Progress, Back, and editing

Progress reflects presented top-level slices only. A slice owns any internal progress display. Fixed global labels such as “3 of 6” are prohibited.

Back returns through presentation history. It does not reveal slices that auto-completed without presentation. Auto-completed restore facts remain visible in restore review. Creation facts and deferred entries remain visible on Result with explicit edit actions.

A Change action opens the owning slice directly. Accepting the edit reruns dependent derivations and validation, then returns directly to the owning review surface.

## 5. Slice contracts

Each slice has a stable identity and owns:

- its accepted output type;
- completion predicate;
- validation;
- presentation;
- optional internal checkpoints.

A slice does not choose routes, activate a Workplace, mark a journey complete, or mutate unrelated preferences.

### 5.1 Device setup

The Device slice used by first-run restore requires a non-empty trimmed User display name. Its acceptance writes the User name and registers the Device at that checkpoint; it does not create books or choose appearance. Conversational creation instead captures a candidate on Welcome and applies identity only after publication, as specified in section 4.0.

During first-run restore, precedence is:

1. non-empty imported name;
2. non-empty User-entered candidate;
3. otherwise Device setup remains required.

No first-run path synthesizes `User`.

Restore remains available from Welcome and the registered-empty-device creation entry. Selecting it starts a Restore setup journey. A non-empty typed name is carried forward as a User-entered candidate; a blank value remains missing.

### 5.2 Workplace configuration

Restore collects only publication-critical identity and base-currency facts not authoritatively supplied by the selected source. Missing identity receives a visible suggestion rather than silent completion. Missing or ambiguous base currency must be resolved before publication. Imported accounts and categories remain imported books; restore is not a financial editor.

Conversational creation has no identity step. It generates a distinct default Workplace name/icon and collects currency plus optional accounts, income, payments, and limits. Migrated accepted custom identities and starter definitions retain their values and provenance. A starter definition without an entered balance is metadata, not a zero-balance assertion or a contribution to the estimate.

An empty or fully deferred creation input can finish and create an empty Workplace. The Result identifies that no usable estimate exists. Valid zero, positive availability, and shortfall are distinct states. Included planned items require a valid spendable account; unresolved dependencies remain editable or can be explicitly deferred.

### 5.3 Appearance

Theme and font are User preferences configured through the existing appearance settings. This creation change adds no Appearance step. Retained restore recipes keep their existing appearance behavior; they do not acquire a new appearance checkpoint from creation consolidation.

### 5.4 Restore source

Restore source owns file selection, parsing, validation feedback, source fingerprinting, and publication progress. The stable operation identity is persisted before publication begins.

Preparation returns available User, Workplace, and appearance facts with provenance, warnings, and publishable in-memory data. Required missing Workplace facts are collected through Workplace setup before publication.

If a resumed source reference is unavailable, retain the resolved facts and operation identity, then ask the User to reselect a file. The new file must match the stored fingerprint.

### 5.5 Restore summary

Restore summary reads the published inactive Workplace and shows its identity, currency, account/category and journal statistics, skipped items, and warnings.

Failure to read or verify the published Workplace blocks continuation. The User may retry or explicitly discard the operation-owned restore.

Actions vary by recipe:

- first run: Continue setup;
- registered Device with no Workplace: Activate;
- picker: Open imported Workplace or return to picker;
- Settings: Open imported Workplace or stay in the current Workplace.

The surface reports intent. Its caller owns the resulting transition.

### 5.6 Conversational Result

Result reviews the included effective inputs, forecast window, estimate, and deferred entries. It supplies edit actions for the owning collector without adding another step. Deferred rows remain in the unfinished session across navigation and restart; finishing explicitly continues without saving those entries, with that consequence visible beside the final action.

Continue validates a collection and includes it; defer preserves its editor input and excludes it from calculation/publication. Missing, invalid, and valid-zero amounts are separate states. Result cannot publish invalid included input, unresolved dependencies, or an in-flight edit. While saving, editing and repeated submission are disabled.

A publication error preserves the editable session. A failure to open an already-published Workplace offers Retry opening, never another creation commit. Creation-only Setup summary and starter-selection surfaces are retired after migration and route compatibility are implemented.

## 6. Workplace restore

The restore persistence boundary has two operations:

1. **Prepare** — parse, normalize, validate, collect facts and warnings, and hold publishable data in memory.
2. **Publish** — atomically insert the Workplace shell and validated books under the stable operation ID, then return a Restore handoff.

The Restore handoff contains the operation ID, published Workplace ID, imported facts and provenance, counts, metadata, and warnings. It contains no navigation or completion decision.

Publication does not:

- activate the Workplace;
- register the Device;
- mutate User name, theme, or font;
- mark Setup accepted;
- navigate.

Settings and picker restore ignore imported User facts. First-run Restore setup may use them as draft input.

Cancelling before publication creates no rows. After publication, Back or app termination retains the inactive Workplace and resumes the journey. Only explicit Discard restore deletes the Workplace created by that operation, after confirmation.

## 7. Finishers and commit semantics

Creation publication and restore finalization have explicit ownership. Each operation is idempotent under its draft's stable operation ID. Database publication is the books commit point; the Setup draft and preferences are outside that transaction.

### 7.1 Creation publication

1. Validate all included effective input before any write.
2. Freeze the submitted payload and atomically publish the Workplace, accounts/categories, opening journals, planned entries, budgets, and completion evidence.
3. On retry, verify completed publication and perform remaining follow-ups without recreating journals or adjusting balances again. An old partial Workplace row alone is not proof of completion.
4. For first-run intent only, apply the entered User name and Device registration as idempotent follow-ups. Adding a Workplace never renames or re-registers a Device.
5. Retain the published outcome in the Setup draft, then emit `workplace_created(id)` to the launch coordinator.
6. Let the coordinator validate and open that target through its normal transition boundary. A failed transition retains the previous Workplace and a retryable published outcome.
7. Clear the unfinished Setup draft only after successful finalization. A process exit before cleanup resumes the remaining effects for the same operation.

### 7.2 Restore finalization

Retained restore recipes verify operation-owned publication and its handoff, apply permitted identity edits and recipe-owned Device facts, and report their accepted outcome through the launch coordinator. They retain source ownership and discard behavior. This creation change does not add a new Device/Appearance/summary step to restore.

### 7.3 Recovery

Failure after atomic publication reports that books are saved and offers the appropriate follow-up retry. It never reports valid books as uncommitted or deletes them because preferences or opening failed. Draft cleanup cannot precede recoverable outcome delivery. Optional creation remains optional on normal launch, but resuming it preserves the published target and finalization intent.

## 8. Cancellation and concurrency

- Only one active Setup draft exists per Device.
- A blocking journey cannot be displaced by another journey.
- First-run Setup has no cancellation path into the app. The User may restart fresh setup or choose restore.
- Restore may explicitly discard its operation and return to the appropriate previous gate.
- Leaving later Workplace creation returns to the current Workplace and retains the optional draft. The next attempt offers Resume or Discard.
- Starting another optional journey requires resolving the existing optional draft first.

## 9. Device inbox tenancy

Device inbox behavior remains separate from Setup:

- one pending SMS feed per Device;
- Workplace copies only after consume or dismiss;
- Device SMS listen is Device-owned and default off;
- Workplace restore includes consumed Workplace copies but never the Device feed or Device preferences;
- no SMS-listen or inbox step is added to first-run Setup.

## 10. Acceptance matrix

### Launch and state

1. A valid blocking draft resumes before normal launch resolution.
2. An optional creation draft never blocks opening the current Workplace.
3. Welcome and financial collection create no database rows before Result confirmation.
4. Process termination restores semantic step, editable fields, deferred state, and operation identity without registering a first-run Device prematurely.
5. No books provider mounts before a validated `open(workplaceId)` result.
6. No parallel onboarding-complete, numeric-stage, or pending-Workplace flag authorizes entry.

### Creation

7. Every creation entry uses the conversational surface, with the correct blocking/optional context and identity policy.
8. Publication is atomic and retry-safe, including opening journals, planned entries, and budgets.
9. Deferred entries survive the unfinished session and are excluded from calculation/publication; finishing without them is explicitly disclosed.
10. Invalid, missing, and valid-zero amounts remain distinct. Repeated account or payment types are valid separate rows.
11. Valid accepted legacy creation facts survive migration without inventing a balance or subtype.
12. A failed open after saving retains the published outcome and retries opening without another commit.
13. Optional cancellation returns to the originating page and previously committed Workplace.

### Restore

14. A backup name can satisfy the first-run restore Device slice; an entered candidate is used only when an imported name is absent.
15. If neither name exists, Device setup remains required after restore publication.
16. Missing Workplace identity or ambiguous base currency is resolved before publication.
17. Imported identity and books are preserved except for explicitly allowed corrections.
18. Settings and picker restore do not acquire creation-only identity or appearance effects.
19. Process exit retains restore operation ownership and resumes the existing recovery path.
20. Explicit discard affects only the current operation-owned inactive restore Workplace.
21. Restore review failures block continuation and offer the existing retry/discard actions.
22. Back/discard from an empty-device restore returns to blocking conversational creation, not a retired recipe.

### Progress and ownership

23. Progress counts actual visible steps/checkpoints, with one presentation component and no hardcoded restore total.
24. Restore recipes and conversation navigation retain separate typed sequencing within one Setup store.
25. Publication, Device facts, accepted intent, and opening a Workplace remain separate facts owned by their existing boundaries.

## 11. Non-goals

- Cloud identity, membership, or role-based access.
- Runtime or remote Setup plugins.
- A graph/state-machine library.
- A dependency-injection container or event bus.
- A universal effect journal or workflow database.
- Generic schema-driven forms.
- Guessing a migration for arbitrary unknown or corrupt draft schemas; valid supported legacy Setup drafts retain explicit compatibility readers.
- Editing imported financial data during Restore setup.
- Device SMS listen or app-lock setup during first run.
