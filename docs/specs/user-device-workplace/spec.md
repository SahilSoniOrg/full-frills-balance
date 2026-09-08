# Spec — User, Device, Workplace, and Setup

**Product:** Full Frills Balance
**Date:** 2026-09-01
**Status:** Approved behavior; core implementation exists, targeted cleanup remains
**Related:** [`CONTEXT.md`](../../../CONTEXT.md), [`docs/adr`](../../adr/), and [`docs/plans/setup-simplification-plan.md`](../../plans/setup-simplification-plan.md)

This is the canonical behavior and ownership contract. Terms follow `CONTEXT.md`. File paths and component names are intentionally excluded.

## 1. Domain ownership

| Concern                                                                                                        | Owner       |
| -------------------------------------------------------------------------------------------------------------- | ----------- |
| Display name, theme, font, privacy mask, notifications                                                         | User        |
| Device registration, app lock, Active workplace, telemetry ID, Device inbox, Device SMS listen                 | Device      |
| Journals, accounts, currency, budgets, planned payments, Workplace settings, SMS rules, Workplace inbox copies | Workplace   |
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
  → Device setup
else if no Workplaces exist
  → Workplace setup or Workplace restore
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

A Setup journey is an ordered recipe of Setup slices. The Setup Coordinator performs a linear scan from the current position:

1. ignore slices not included by the recipe;
2. auto-complete a `when_missing` slice only when all required authoritative facts are present;
3. stop at the first slice requiring presentation;
4. persist only accepted checkpoints;
5. execute a recipe-specific finisher after the terminal confirmation.

Slice participation policies are:

- **required** — must be presented and accepted;
- **when missing** — auto-complete from authoritative facts, otherwise present;
- **always show** — prefill available facts but require explicit confirmation.

Defaults may prefill a field, but never turn a required missing fact into an auto-completed slice.

### 3.1 Fact provenance

Provenance is retained only for facts that affect prefilling, auto-completion, or dependent derivation:

- User-entered;
- imported;
- existing;
- defaulted.

At minimum this applies to User display name, Workplace identity and required configuration, and appearance. Ordinary selections made inside Workplace setup do not need provenance wrappers.

### 3.2 Draft behavior

There is at most one active Setup draft per Device.

The draft contains:

- journey identity and whether it blocks launch;
- stable operation identity;
- accepted slice outputs;
- limited fact provenance;
- presentation history for Back;
- a reference and fingerprint for an uncommitted Restore source, when present;
- a Restore handoff after publication, when present.

Parsed accounts, journals, transactions, and other imported books are never serialized into the Setup draft. Before publication, a resumed restore reparses the selected source. After publication, the Workplace row and its books are authoritative.

A corrupt draft is rejected. Rejecting it never deletes published books. Normal launch recovery handles valid Workplaces; an unpublished restore returns to source selection.

## 4. Journey recipes

| Journey                                | Entry policy            | Presented order                                                                                                             |
| -------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| First run                              | Blocking                | Device setup → Workplace setup → Appearance setup → Setup summary                                                           |
| First-run restore                      | Blocking                | Restore source → missing publication facts → Restore summary → Device setup when missing → Appearance setup → Setup summary |
| Registered Device with zero Workplaces | Blocking                | Workplace setup → Setup summary, or Restore source → missing publication facts → Restore summary → Activate                 |
| Restore from picker                    | Blocking while selected | Restore source → missing publication facts → Restore summary → Open or return to picker                                     |
| Restore from Settings                  | Optional                | Restore source → missing publication facts → Restore summary → Open or stay                                                 |
| Later Workplace creation               | Optional                | Workplace setup → Setup summary                                                                                             |

Workplace replacement is maintenance, not a Setup journey. It may reuse restore parsing and validation but keeps separate confirmation and completion behavior.

### 4.1 Progress, Back, and editing

Progress reflects presented top-level slices only. A slice owns any internal progress display. Fixed global labels such as “3 of 6” are prohibited.

Back returns through presentation history. It does not reveal slices that auto-completed without presentation. Auto-completed facts remain visible on Setup summary and may be edited through an explicit Change action.

A Change action opens the owning slice directly. Accepting the edit reruns dependent derivations and validation, then returns directly to Setup summary.

## 5. Slice contracts

Each slice has a stable identity and owns:

- its accepted output type;
- completion predicate;
- validation;
- presentation;
- optional internal checkpoints.

A slice does not choose routes, activate a Workplace, mark a journey complete, or mutate unrelated preferences.

### 5.1 Device setup

Device setup requires a non-empty trimmed User display name. Acceptance writes the User name and registers the Device at that checkpoint; it does not create books or choose appearance.

During first-run restore, precedence is:

1. non-empty imported name;
2. non-empty User-entered candidate;
3. otherwise Device setup remains required.

No first-run path synthesizes `User`.

Restore remains available from the Device setup surface. Selecting it starts a Restore setup journey. A non-empty typed name is carried forward as a User-entered candidate; a blank value remains missing.

### 5.2 Workplace setup

Workplace setup is one slice with private internal checkpoints:

- identity;
- base currency;
- starter asset/liability accounts;
- starter income/expense categories.

Default setup derives `{trimmed User display name}'s Personal workplace` and `briefcase`. The derived name follows display-name edits until the Workplace name is edited directly, after which its provenance is User-entered and it remains stable.

Full setup presents identity. Restore presents only publication-critical checkpoints not authoritatively supplied by the source. Missing Workplace identity receives a visible suggestion, not silent completion. Missing or ambiguous base currency must be resolved before publication.

Fresh setup requires at least one starter account, one income category, and one expense category. Imported books retain their imported accounts and categories; Restore setup does not turn into a financial editor.

### 5.3 Appearance setup

Appearance setup owns theme and font selection. It is always shown during first run, including when a backup contains valid appearance.

Imported or existing appearance may prefill the slice. Preview is scoped to Setup and does not mutate User preferences. Discarding Setup removes the preview. The accepted appearance is written by the journey finisher.

Later Workplace creation, picker restore, zero-Workplace restore for an already registered Device, and Settings restore do not repeat Appearance setup.

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

### 5.6 Setup summary

Setup summary displays every accepted or auto-completed fact relevant to the recipe. For first run this includes User name, Workplace identity, base currency, starter account/category counts, theme, and font.

Fresh Workplace fields are editable through their owning slices. During restore, Workplace name and icon are editable; imported currency, accounts, categories, journals, and other books are read-only until normal app use.

Acceptance is disabled while required facts are missing, dependent derivations are stale, Restore summary is unreadable, or a finisher is running.

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

There are three explicit finishers:

- first run;
- Restore setup;
- later Workplace creation.

Each finisher is idempotent under the draft's stable operation ID.

### 7.1 First-run finisher

1. Validate the full accepted draft.
2. Publish or verify the operation-owned Workplace, system accounts, selected starters, and any future draft journal in one database transaction.
3. Write accepted User name and appearance.
4. Persist Device registration and Active workplace.
5. Clear the Setup draft last.
6. Emit the terminal outcome.

### 7.2 Restore-setup finisher

1. Verify the published Workplace matches the Restore handoff.
2. Validate all remaining accepted Setup facts.
3. Apply allowed Workplace identity edits.
4. Write accepted User name and appearance when the recipe includes them.
5. Persist Device registration and Active workplace.
6. Clear the Setup draft last.
7. Emit the terminal outcome.

### 7.3 Later-creation finisher

1. Validate the Workplace draft.
2. Publish or verify the operation-owned Workplace and starter books atomically.
3. Clear the optional Setup draft.
4. Emit `workplace_created(id)`.
5. Let the launch coordinator validate and perform the normal Workplace transition.

Database publication is the books commit point. A failure afterward never reports valid books as uncommitted. The retained draft lets the same finisher verify publication and retry remaining idempotent writes.

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

1. A valid blocking draft always resumes before normal launch resolution.
2. An optional creation draft never blocks opening the current Workplace.
3. Fresh Device setup with no Workplace creates zero database rows.
4. After Device setup acceptance and app termination, launch resumes Workplace setup.
5. No books provider mounts before a validated `open(workplaceId)` result.
6. No persisted onboarding-complete or onboarding-stage flag is consulted.

### Fresh setup

7. Workplace, account, category, and journal counts remain zero until Setup summary acceptance.
8. First-run publication is atomic and retry-safe under one operation ID.
9. Appearance preview does not change User preferences before acceptance.
10. Editing a defaulted User name updates the derived Workplace name; editing the Workplace name breaks that derivation.

### Restore

11. Backup name present → Device setup auto-completes; Restore summary is followed by Appearance.
12. Backup name absent, typed candidate present → candidate satisfies Device setup.
13. Both names absent → Device setup is presented after Restore summary.
14. Missing Workplace identity → identity checkpoint appears before publication.
15. Missing or ambiguous base currency → currency checkpoint appears before publication.
16. Published imported identity is preserved unless the User explicitly edits name or icon.
17. Settings and picker restore do not modify User name, theme, or font.
18. Crash after publication but before acknowledgement resumes from the persisted operation and published Workplace.
19. Explicit discard deletes only the current operation-owned inactive Workplace.
20. Restore summary read failure blocks activation and offers retry or discard.

### Extensibility

21. Adding a Demo journal slice requires a slice module, recipe entry, accepted draft output, and finisher handling; it does not modify Setup Coordinator control flow.
22. Recipe progress contains no fixed global step count.

## 11. Non-goals

- Cloud identity, membership, or role-based access.
- Runtime or remote Setup plugins.
- A graph/state-machine library.
- A dependency-injection container or event bus.
- A universal effect journal or workflow database.
- Generic schema-driven forms.
- Migrating any unreleased named-stage or Setup-draft shape.
- Editing imported financial data during Restore setup.
- Device SMS listen or app-lock setup during first run.
