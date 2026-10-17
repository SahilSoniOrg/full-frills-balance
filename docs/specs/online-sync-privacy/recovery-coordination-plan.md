# Extract durable encrypted-recovery coordination

Status: implemented; validation results are recorded below.

## Objective

Move recovery Device ID allocation, restore-session persistence and pending-checkpoint cleanup out of `usePrivateBackup`. Make the ordering and retry behavior testable without React, while continuing to use the existing backup/restore services.

This is a small application-workflow extraction. It does not introduce a general backup manager, workflow state machine, event bus or replacement crypto abstraction.

## Pre-extraction flow and responsibility leak

Before extraction, `src/features/settings/hooks/usePrivateBackup.ts`:

1. Generates a random recovery Device ID and persists it through `pendingEncryptedRestoreDeviceId.ts` when a recovery credential is selected.
2. Reuses that ID on restore, or chooses already-verified Device access.
3. Calls `restoreEncryptedBackupZip`, whose existing implementation verifies/decrypts, recovers identity when required, validates financial data, publishes rows with a manifest-hash receipt, installs Workplace keys and rebuilds derived balances.
4. Writes the recovered session through `encryptionSetupStore`, then removes the pending Device ID.
5. Releases selected inputs and completes the visible launch flow through the existing setup helper or Workplace context, then navigates and displays warnings.

The hook also removes the pending ID when selections are cleared. That cleanup is asynchronous and currently unawaited. Financial publication, key persistence, session persistence and selection clearing are not one transaction; clearing a UI selection cannot be treated as proof that no recovery progress exists.

## Intended boundary

| Owner                                                 | Responsibilities after this change                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New `src/services/backup/encryptedRestoreWorkflow.ts` | Allocate/reuse the durable recovery Device ID; select existing-Device versus recovery access from supplied verified identity; invoke existing restore; persist the resulting session; clear the pending checkpoint in the correct order; expose explicit pending-attempt cleanup semantics. |
| `usePrivateBackup`                                    | File-picker interaction, selected archive/credential references, foreground/focus/lock lifecycle observation, busy state, confirmations, messages, temporary-input release, launch integration and navigation.                                                                              |
| Existing restore/key services                         | Cryptographic verification, recovered-key persistence, financial validation/publication, receipts, key installation and derived-data rebuilding.                                                                                                                                            |
| Existing setup completion helper / Workplace context  | Device registration, active Workplace selection and blocking-setup-draft cleanup. Keep these existing owners; do not import feature modules into the new service.                                                                                                                           |

The workflow must not import React, router hooks, screens, dialogs, navigation or the Workplace context. It must not perform file selection or own component lifetimes. The hook must stop generating IDs or directly reading/writing the pending recovery checkpoint and encryption setup session.

## Small public contract

Use named functions or a small service with narrow injected dependencies for tests. Keep dependency wiring in one production composition point. Suggested operations (final naming may follow repository conventions):

- `prepareRecoveryAttempt()`: return the persisted pending Device ID, allocating it once when absent. Preserve the current credential-selection timing; restore must also resolve it safely for retries.
- `restoreSelectedBackup({ archive, credential?, existingIdentity?, signal? })`: validate required inputs, use verified existing access when available, otherwise obtain the pending ID, delegate to `restoreEncryptedBackupZip`, persist the returned session, then clear the pending checkpoint and return the existing restore result.
- A separate explicit cleanup operation only if needed by the selected-file clear action. Its contract must distinguish releasing selections from abandoning durable recovery progress; do not expose a generic reset.

Pass the existing archive bytes and opaque credential reference for the duration of the call. Do not persist either in a new store. Reuse existing result types unless a smaller result is genuinely needed; avoid introducing another status/error taxonomy.

## Durable ordering and retry rules

| Boundary                                                 | Required behavior                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before recovering a new Device                           | Persist its ID before invoking recovery. Storage read/write failures propagate; they do not authorize generating a replacement identity.                                                                                                                |
| Existing verified Device access                          | Use that identity without allocating a recovery Device ID or requiring a recovery credential.                                                                                                                                                           |
| Verification, validation or publication failure          | Do not write a successful restore session or clear the pending attempt. A recovered identity may already exist even if financial publication failed.                                                                                                    |
| Restore service succeeds                                 | Save the session using the returned verified identity and restored Workplace, then clear the pending ID. Never reverse this order. Preserve the current session format and fields.                                                                      |
| Session write fails after restore                        | Keep the pending ID so retry can reuse recovered Device state and the existing publication receipt. Propagate the failure; do not report overall completion or roll back valid restored books.                                                          |
| Pending-ID removal fails after session save              | Surface the failure and retain a retry path using the same verified identity. Repetition must not duplicate records or create a new Device.                                                                                                             |
| Lock, blur or cancellation                               | The hook suppresses obsolete UI effects and releases temporary references. Keep existing engine/app-lock checks. Cancellation is not rollback and must not discard durable progress.                                                                    |
| Restore has already succeeded when the screen disappears | Finish necessary session/checkpoint finalization rather than introducing a cancellation check that strands the completed restore. Do not navigate, update the Workplace context or show dialogs from the service.                                       |
| Clear selected files                                     | Release UI inputs immediately. Do not erase the durable Device ID merely because files were deselected if recovery may already have persisted keys. Serialize any safe explicit abandonment with allocation/finalization; await or report its failures. |

Serialize overlapping durable recovery operations at the shared workflow instance, including ID creation and checkpoint cleanup, so two mounted consumers cannot allocate different IDs or a delayed clear remove a newer attempt. Do not assume the hook's busy flag or AbortController provides mutual exclusion. Do not add a second queue inside crypto or change database transaction ownership.

Scope the cancellation guarantee honestly: the existing restore implementation cancels on key-access policy changes; it does not currently accept the hook's signal. Use an optional workflow signal to prevent obsolete work before delegation where appropriate, but do not claim that passing it interrupts an in-flight restore unless propagation is explicitly implemented and tested. Broader cancellation changes are outside this extraction.

## Implementation sequence

### 1. Characterize behavior and extract the durable owner

- Add the workflow beside existing backup services, delegating to the existing restore action and stores. Move `freshDeviceId` and `resolveRecoveryDeviceId` from the hook.
- Retain the existing pending storage key and session schema; no migration is expected.
- Give the workflow one shared serialization boundary and a small test composition with in-memory stores, controlled IDs and a controllable restore promise.
- Document selection clearing separately from durable attempt abandonment. If changing the current unconditional deletion is necessary to preserve retries, record that narrowly as an intentional correctness fix, not a mechanical move.

### 2. Integrate the hook without expanding scope

- Replace direct ID/store calls with the workflow operations during credential selection, restore and any explicit attempt cleanup.
- Leave enrollment, backup export, file adapters, generated credential handling, UI reducer and error-to-message mapping in their current owners.
- On workflow success, release selected inputs, then perform existing setup completion / Workplace-context activation only while the UI remains current. Navigate and show balance warnings afterward.
- Keep the existing setup helper and its tests. Do not move all first-run setup into the workflow just to reduce the hook's line count.
- Update hook tests to mock the workflow boundary and verify UI integration rather than its storage internals.

### 3. Verify retry and interruption boundaries

Add service-level tests for:

- Pending ID reused across retries and across new workflow consumers; only one ID created for concurrent requests.
- ID persistence failure prevents recovery invocation.
- Existing-Device restore allocates no new ID and needs no credential.
- Restore rejection leaves the pending attempt intact and writes no successful session.
- Exact ordering: restore success → session save → pending clear.
- Session-save failure after publication followed by retry with the same Device ID and receipt; pending-clear failure followed by safe repetition.
- Selected-file clearing or an overlapping stale action cannot remove progress needed by an active/retryable attempt.
- Cancellation before delegation prevents new work; loss of focus during a successful restore suppresses UI effects while durable finalization remains possible.
- Restore warnings remain successful outcomes and reach the UI unchanged.

Keep receipt/idempotency and actual database publication assertions in the existing repository/restore integration suites; service mocks alone are not evidence of financial atomicity. Keep a small set of hook tests for first-run versus existing-workplace activation, navigation, warning display, lock/blur and clear-input interaction.

## Acceptance and validation

- No recovery ID generation or direct recovery-session/checkpoint store access remains in `usePrivateBackup`.
- The workflow is testable without mounting React and imports no feature/UI modules.
- Existing archive bytes, crypto APIs, key-state formats, database publication order, restore receipts and user-visible journeys remain compatible.
- Run type checking, architecture checks, the new workflow tests, updated hook tests, setup completion tests, existing restore tests and publication/receipt tests.
- Build the web E2E export and run all current Playwright backup/recovery and setup scenarios, including the fixed pre-refactor archive. Add a browser case only if a newly identified cross-reload behavior is not covered meaningfully by service/integration tests.
- This extraction changes no C++/WASM inputs. Rebuild crypto artifacts only if implementation unexpectedly changes their inputs; such a scope expansion should be justified separately.

## Exclusions

No crypto/protocol changes, database/file-adapter rewrite, archive streaming, writer-lock optimization, broad session-state redesign, automatic startup recovery, new enrollment flow, screen redesign or general workflow framework. The unrelated uncommitted `app.config.ts` web-output edit remains separate.

The result should remove a correctness responsibility from the UI, not merely relocate the entire hook into another large class.

## Implementation notes

- `encryptedRestoreWorkflow.ts` owns the shared queue, pending Device ID, restore delegation and session/checkpoint finalization. Production wiring is contained in that module; tests inject stores and restore behavior.
- Selection clearing is intentionally UI-only and aborts the originating UI operation. It never deletes the pending Device ID: the existing checkpoint contains no evidence that abandonment is safe. This is a correctness fix to preserve recovery retries.
- A queued restore without a supplied identity rechecks the saved session through the key hierarchy before allocating a recovery ID. This prevents a second queued consumer from creating another Device after the first consumer successfully finalizes and clears the checkpoint.
- The workflow checks cancellation before delegation, including after asynchronous identity/ID resolution. Once restore succeeds, session save and checkpoint removal complete irrespective of the UI signal. The existing restore engine continues to own in-flight app-lock cancellation.
- The hook mocks the workflow in UI tests; workflow tests cover storage ordering and failures. Existing restore/publication suites remain responsible for actual Device reuse, receipt idempotency and database publication guarantees.

## Validation results

- `bun run typecheck` — passed.
- `bun run check:architecture` — passed, including native-key boundaries, dependency cycles and E2E type checking.
- Changed-file ESLint and `git diff --check` — passed.
- Targeted Jest run covering the workflow, hook, encrypted restore launch completion, all sync suites, row-restore repository and publication claims — 12 suites, 99 tests passed. The hook suite also passed after correcting its typed context fixtures.
- `bun run e2e:build:web` — passed using the existing WASM artifacts.
- `bun run e2e:test:web e2e/web/specs/encrypted-backup.spec.ts` — all 8 browser scenarios passed, including reload/interrupted setup, repeated recovery, independent Device access and the fixed pre-refactor archive. The local server timed out in the sandbox; the approved retry outside the sandbox passed.
