# Verify restore interruption and retry across durable boundaries



Status: implemented; browser, real-core integration, production JavaScript and Hermes-bytecode exclusion verification passed. Native device release gates remain open.

## Objective

Prove that encrypted recovery remains safe when an operation fails or the page disappears between durable writes. Retry must preserve the recovered User/Device, avoid duplicate financial records, finish required checkpoints and leave the app usable after reload.

This is verification work, not another architectural extraction. Extend existing coverage only where mocks or same-process tests leave a gap. Fix an implementation defect only when a new scenario demonstrates it; describe that fix and its test separately.

## Existing evidence and remaining gap

| Boundary | Existing evidence | Missing evidence to add |
| --- | --- | --- |
| Device recovery succeeded; financial publication has not | `restoreBackup.test.ts` models recovered Device reuse with mocked key operations; hierarchy suites cover actual recovery separately | The real recovered identity and retry ID survive reload, with no published financial rows, and a retry uses them successfully |
| Financial publication succeeded; Workplace key installation has not | Restore tests check ordering; repository tests prove same-receipt idempotency and collision rejection | An actual published receipt survives interruption, then retry finishes key installation without republishing/overwriting the financial state |
| Restore succeeded; session save fails or has not completed | Workflow tests retain the pending ID and retry with injected in-memory stores | Real database, key stores and pending ID survive reload while the session remains absent/old; retry finalizes the same recovery |
| Session saved; pending-ID removal fails or has not completed | Workflow tests re-verify the saved Device and retry after a mocked clear failure | Reload with both saved session and stale pending ID, then finish cleanly without allocating another Device |
| Post-restore UI loses focus / is locked | Hook tests suppress visible effects; workflow tests finish checkpoints after cancellation | Keep these focused tests; add browser interruption evidence through the scenarios above rather than duplicating every UI test |

The current browser suite covers malformed inputs, setup resumption, repeat restore, existing-Workplace refusal, independent Device access. Those do not by themselves prove interruptions between restore persistence steps. Plaintext `restorePublicationClaims` tests concern another restore mechanism and must not be treated as evidence for the encrypted manifest-hash receipt.

## Durable sequence under test

```text
Save pending recovery Device ID
  → verify backup and recover the same User onto that Device
  → decrypt and validate complete financial state
  → atomically publish rows + manifest-hash receipt
  → install Workplace keys and restore preferences / rebuild derived balances
  → save encryption setup session
  → clear pending Device ID
  → complete launch / activate Workplace / navigate
```

These are multiple persistence owners, not one transaction. Recovery-key progress before financial publication is legitimate; a failure does not mean every store should be empty. Use the existing ordering as the contract and distinguish primary financial rows from rebuildable derived data.

## Test cases and expected persisted state

Use a synthetic backup with accounts, at least one balanced journal and its transaction legs, journal metadata and audit records. The existing seeded browser backup can supply this. Keep the matching User recovery credential separate. Restore into a new browser context with no initial financial data or Device access, retaining that same context across reloads/retries.

### A. Recovered Device, no financial publication

Interrupt after verified User/Device recovery has durably completed but before `batchInsertRowRestore` writes anything. Include a real publication rejection at the integration layer.

- Pending Device ID and recovered public identity/key records exist; financial rows and restore receipt do not.
- Reload or recreate the workflow without resetting persistent storage. Re-select the same archive and credential through the normal UI.
- Retry reuses the same User UUID, identity fingerprint and Device ID. No replacement root or additional Device is generated.
- The complete financial dataset is published once and launch completes.

### B. Published financial state, Workplace keys not yet installed

Interrupt immediately after the real database batch/receipt completes and before Workplace-key installation.

- Financial rows and the exact manifest-hash receipt exist atomically. Workplace key installation has not completed; session completion and pending cleanup have not run.
- After reload, the same archive/credential can resume through the existing restore route. Assert the route is reachable with this partial state; do not add automatic recovery as a shortcut.
- Retry recognizes the same receipt, preserves existing primary records and original IDs/audit history, installs the expected Workplace keys and completes session/launch finalization.
- Retrying a valid, independently signed archive for that same Workplace with a different manifest hash still fails without modifying its books or receipt.

### C. Restore complete, session not saved

Fail the real setup-session write once, before it modifies storage. Also exercise interruption at the equivalent before-write boundary.

- Financial state, receipt and installed keys survive; the old/absent session and pending Device ID remain.
- No successful completion/navigation is reported for the failed operation.
- Reload and retry with the same files. The verified Device and published receipt are reused, session save succeeds, pending ID clears and the app opens the restored Workplace.

### D. Session saved, pending cleanup incomplete

Fail pending-ID removal once before deletion, and separately interrupt immediately before it executes.

- Session matches the recovered identity, installed keys and restored Workplace; the pending ID remains stale.
- Reload and retry using verified existing Device access through the normal restore UI. No recovery-file requirement or new Device allocation is introduced just to clear the checkpoint.
- Retry removes the stale pending ID, preserves financial data/receipt and completes the normal UI flow. A second reload opens the restored Workplace without blocking setup.

### E. Pending cleanup complete, launch not completed

Interrupt after the workflow has cleared the pending Device ID but before the hook registers the Device, activates the Workplace and clears any blocking setup draft.

- Session, identity, Workplace keys, rows and receipt exist; pending ID is absent.
- Reload reaches the normal restore UI without fabricating a new recovery attempt.
- Re-select only the archive, use verified saved Device access, and complete launch.
- Identity/primary rows/receipt stay identical; Settings and Activity work and another reload stays usable.

## Required evidence matrix

| Boundary | Integration failure mode | Browser interruption | Additional browser error mode |
| --- | --- | --- | --- |
| A: recovered | Reject actual publication batch before mutation | Discard after real recovery | Integration covers failure |
| B: published | Fail persistence acknowledgement after the real batch; fail key installation before mutation; reject a second signed manifest | Discard after real publication | Integration covers failure |
| C: session | Fail session write before mutation | Discard before session write | Throw before session write |
| D: cleanup | Fail pending removal before mutation | Discard after saved session, before removal | Throw before pending removal |
| E: launch | Existing launch-finisher/workflow ordering regressions | Discard after pending removal, before launch | Browser interruption establishes added boundary |

## Fault injection design

- Prefer integration-test dependency wrappers around the real stores, hierarchy, restore service and publication owner. Delegate normally and inject exactly one named failure or pause. Do not mock the operation whose durability/idempotency is being asserted.
- For browser cases, first use targeted browser-side storage interception where the intended boundary can be identified reliably. If that cannot target recovery/publication boundaries, add the smallest test-only adapter seam through the existing authenticated E2E bootstrap. It must be absent/inert in normal builds, use the existing E2E authorization rules, and be covered by production-bundle checks.
- A fault has a named boundary, an explicit mode (throw before mutation, or pause after confirmed completion) and a reached acknowledgement. Wait for that acknowledgement before reloading/closing the page; do not use arbitrary sleeps to guess when a write finished.
- Disarm one-shot faults before retry/reload so init scripts or startup cannot accidentally re-arm them. Assert each fault was reached exactly once.
- An injected exception proves an error path; it is not proof of abrupt termination. For reload interruption, pause with durable progress acknowledged, discard the page/worker execution and reopen the same persistent context. Do not rely on `finally` or graceful cancellation to finalize the discarded attempt.
- Reopening a fresh empty browser context is not a reload test. Recreating an in-memory store with seeded expected values is not persistence evidence.
- Do not add production fault flags, expose raw keys/credential text, copy vaults or weaken lock/identity checks. Diagnostics may read public identity/fingerprint metadata, checkpoint presence and financial counts/IDs through a narrow test-only observation path.

## Assertions beyond a success screen

For every scenario record the reached boundary and verify state before interruption, after reload and after retry:

- Stable User UUID, User public fingerprint, recovery Device ID and Workplace key fingerprint.
- Pending-ID and setup-session contents, expected Workplace-key installation status and exact manifest-hash receipt.
- Account/journal/leg/metadata/audit IDs, counts and representative financial content. Counts alone cannot detect replacement or corruption.
- No partial financial publication before the atomic batch. After publication, retry preserves existing primary data/audits and does not fabricate import audit events. Derived balance rebuilding may legitimately repeat.
- Balanced posted journals and expected reconstructed balances after successful completion; any rebuild failure remains a visible warning rather than silent full success.
- Settings and Activity are usable, the expected Workplace is active and another reload persists completion without a blocking setup loop. Existing negative archive/identity/collision tests still pass.

## Implementation and validation sequence

1. Inventory existing tests against A–D and establish a successful real-engine baseline with the chosen synthetic dataset. Reuse existing coverage where its assertions already prove a property.
2. Add deterministic store/restore integration tests for write failures and checkpoint ordering, using real publication/receipt behavior. Keep current workflow and hook unit tests as fast regressions.
3. Add parameterized browser scenarios for the five durable boundaries with real WASM, persistent browser storage and real financial publication. Exercise actual page/worker discard and retry; use additional throw-mode browser cases only where integration tests cannot establish the intended behavior.
4. If a scenario reveals an unreachable retry route, identity replacement, premature cleanup or duplicate publication, add the smallest fix in the current owner. Complete the changes before testing; batch corrective validation after reviewing failures. Do not hide failures by weakening assertions or manually installing successful state.
5. Run application/E2E type checks, architecture checks, focused workflow/hierarchy/restore/publication/hook tests, WASM artifact freshness checks, web/E2E builds, production test-harness exclusion checks and all existing/new Playwright scenarios.
6. Record commands, results, dataset, injected boundaries and remaining limitations in this document. Save useful screenshots/traces/videos under ignored artifact directories; use synthetic credentials only and do not commit per-run recovery files.

## Acceptance and limits

A–D require integration and real-browser persistence/retry evidence; E additionally requires browser interruption evidence. Retry preserves identity and financial records, completes checkpoints and reaches a usable app. Existing backup compatibility and rejection scenarios continue passing. No weakening of authentication, lock policy or atomic publication is introduced.

Browser page/worker interruption is not physical-device process-kill, power-loss or native vault evidence. Keep Android/iOS interruption and real-file-picker release gates open and list the corresponding native follow-up cases; do not mark them satisfied from Chromium results. If a browser-specific storage behavior cannot represent a native failure, state that explicitly.

No format/schema/key changes, automatic startup recovery, general workflow framework or unrelated cleanup are planned. Keep the existing uncommitted `app.config.ts` web-output edit separate. Rebuild native/WASM artifacts only if actual input changes require it.

## Implementation evidence (2026-10-17)

- `modules/expo-key-crypto/tests/restoreInterruption.test.ts`: real C++ crypto, real hierarchy, real financial publication/receipt and rebuilds. Public/ciphertext checkpoints use temporary filesystem storage and owners are reconstructed without seeding successful state. The host vault stays alive; this does not establish native process restart durability.
- `e2e/web/specs/restore-interruption.spec.ts`: seven persistence/retry scenarios (A–E page discard plus C/D write errors), including receipt conflict, full primary-row comparison, public identity/Device-key stability, reconstructed balances, usable Settings/Activity and a second reload. An unauthenticated launch cannot install the adapter.
- `src/testing/restoreVerification.ts`: one-shot named faults installed only by authenticated E2E bootstrap; no archive credentials, key bytes or vault copies are exposed. The production bundle check rejects its unique marker.
- Dataset: six balanced seeded grocery journals, their legs, journal metadata, audit history and accounts. Every scenario uses isolated receiver storage; page/worker discard retains its browser context. Source export and recovery files remain in ignored Playwright output.
- Validation commands/results are recorded below.

Native follow-up release gates remain open on **both Android and iOS**: repeat A–E with actual force-stop/process termination and the same app storage/vault; inject session-write and pending-removal failures; retry through real OS file pickers; verify vault unlock after device lock/relaunch; verify identity, receipt, primary records, balances and launch state after a second restart. Chromium and the C++ test host do not satisfy those gates or establish power-loss durability.

### Demonstrated implementation fixes

The new B interruption scenario initially reloaded into the dashboard: `decideDeviceRecovery` treated freshly published encrypted restore rows as legacy setup completion, even though Workplace keys and the setup session were missing. C/D/E share this exposure; E has already cleared the pending ID. The launch coordinator now passes the presence of a pending recovery ID or a saved `recover-user` session to legacy Device recovery, so it does not infer a completed first-run restore from financial rows alone. This adds no automatic restore or new checkpoint. The pure Device-recovery regressions cover missing/existing preference bags; the B–E browser scenarios exercise the actual reload and normal retry route.

The B–E browser scenarios then demonstrated that a completed Loki batch was only in memory: closing the page before the 500 ms autosave lost the financial rows and receipt. The fixed-archive reload case exposed the same window. `ImportRepository.batchInsertRowRestore` now awaits a platform persistence barrier while holding its existing writer, both after publication and on exact-receipt retries. The web implementation awaits Loki's real IndexedDB save callback; SQLite/Node require no additional flush. A failed save leaves the pending checkpoint and in-memory receipt retryable. Three callback/dispatch regressions and the real-core save-failure scenario cover ordering and error propagation; the browser scenarios establish actual persisted state. This changes neither the schema nor the archive format.

### Validation results

| Command | Result |
| --- | --- |
| `bun run typecheck` | Passed |
| `bun run typecheck:e2e:web` | Passed |
| `bun run check:architecture` | Passed, including 42 guard tests and native E2E type checking |
| Focused Jest command below | 23 suites / 189 tests passed |
| `FFB_OPENSSL_PREFIX=/tmp/pr86-openssl bun run test:native-key-crypto` | 7 suites / 67 tests passed; one opt-in compatibility-fixture capture skipped as intended; the fixed-archive compatibility test passed |
| `FFB_REQUIRE_WASM_ARTIFACT=1 bun run test:wasm-key-crypto` | Artifact freshness and 12 codec vectors passed; five worker tests and real WASM vault test passed |
| `bun run e2e:build:web` | Passed; existing WASM artifacts reused without rebuilding them |
| `bun run e2e:test:web` | All 19 Chromium scenarios passed, including seven boundary/error scenarios and the unauthenticated-adapter rejection |
| `bun run check:production-e2e-web-bundle` | Passed after both fixes; four production JavaScript files scanned; no harness markers |
| Native production JavaScript command below | Passed for Android and iOS; two bundles scanned; no harness markers. Hermes bytecode was unavailable on this host; see limitation below. |
| ESLint command below | Passed |
| `git diff --check` | Passed |

```sh
bunx --no-install jest --runInBand \
  src/services/backup/__tests__ src/services/sync/__tests__ \
  src/data/database/__tests__/flushPersistence.test.ts \
  src/services/launch/__tests__ \
  src/data/repositories/__tests__/ImportRepository.rowRestore.test.ts \
  src/features/settings/hooks/__tests__/usePrivateBackup.test.ts \
  src/features/setup/__tests__/completeEncryptedRestoreLaunch.test.ts \
  src/features/app/__tests__/launchCoordinatorRouting.test.ts \
  src/testing/__tests__/e2eLaunchArgs.test.ts src/testing/__tests__/e2eSeed.test.ts

bunx --no-install eslint \
  src/testing/restoreVerification.ts src/testing/e2eBootstrap.ts \
  src/data/database/flushPersistence.ts src/data/database/flushPersistence.web.ts \
  src/data/database/__tests__/flushPersistence.test.ts src/data/repositories/ImportRepository.ts \
  src/testing/e2eLaunchArgs.ts src/testing/e2eSeed.ts \
  src/testing/__tests__/e2eLaunchArgs.test.ts \
  src/services/launch/deviceRecovery.ts \
  src/services/launch/__tests__/deviceRecovery.test.ts \
  src/features/app/LaunchCoordinator.tsx \
  modules/expo-key-crypto/tests/restoreInterruption.test.ts \
  e2e/web/specs/restore-interruption.spec.ts \
  e2e/web/specs/encrypted-backup.spec.ts e2e/web/support/encryptedBackup.ts
```

The E2E and production Metro caches were isolated so independent builds could not reuse differently gated transforms. These final export commands used existing assets; no native/WASM crypto inputs or artifacts changed:

```sh
mkdir -p /tmp/restore-verification-metro-e2e /tmp/restore-verification-metro-production
TMPDIR=/tmp/restore-verification-metro-e2e bun run e2e:build:web
TMPDIR=/tmp/restore-verification-metro-production bun run check:production-e2e-web-bundle
TMPDIR=/tmp/restore-verification-metro-production APP_VARIANT=production EXPO_PUBLIC_E2E=0 \
  bunx --no-install expo export --platform android --platform ios --no-bytecode \
  --max-workers 2 --output-dir dist/production-e2e-js-check
node scripts/check-e2e-bundle.mjs dist/production-e2e-js-check
```

The default `bun run check:production-e2e-bundle` could not finish Hermes compilation in that run: this host is ARM64 (`aarch64`) but the installed `hermes-compiler` Linux binary is x86-64. The supported `--no-bytecode` export above verified production Android/iOS JavaScript exclusions without weakening the marker assertions. Hermes bytecode compilation was unverified at that point; the ARM64 host follow-up below resolves that compiler limitation. These exports are not native-device execution evidence.

The first production web export reused cached E2E transforms and correctly failed the marker check. Both production exclusion commands now request clean Metro transforms (`--clear`); the clean web export omitted the bootstrap, seed and restore-verification chunks entirely. The native test host used the existing HPKE-enabled OpenSSL installation at `/tmp/pr86-openssl`.

Seven standalone boundary-state proofs are saved in `artifacts/restore-interruption-verification-2026-10-17/proofs/`, and the pre-fix publication-loss trace is retained in its `before-persistence-fix/` sibling. Per-run logs are kept under ignored `artifacts/restore-interruption-verification-2026-10-17/`; Playwright proof attachments, screenshots and failure traces are under ignored `test-results/` and `playwright-report/`. Recovery ZIP/credential files remain synthetic, local and uncommitted.

### ARM64 host toolchain follow-up (2026-10-17)

Source: `8af2bc205a0682bb4b77ee826a9c6719321584c0`, with pre-existing documentation changes. No application or test-source changes were needed for this follow-up.

The HPKE-enabled OpenSSL 3.6.0 installation already existed at `/tmp/pr86-openssl`. Its headers and static libraries were copied to `$HOME/.local/share/ffb-toolchains/openssl-3.6.0`, with the copied pkg-config prefixes adjusted. The host C++ suite passed against this persistent prefix: **7 suites, 67 tests passed**, with the opt-in compatibility-fixture capture skipped. The fixed-archive compatibility test passed.

Installed `qemu-user` supplies `qemu-x86_64` 6.2.0, which can execute the project's existing, statically linked Linux compiler from `hermes-compiler@250829098.0.17`. The compiler reports HBC version 98. Its SHA-256 is `925ddf1bc2f17578e8af5df391c9d84dbd98441540fb43257aac3ef75c54b749`. This uses CPU emulation of the packaged compiler; it does not change the project's Hermes version.

On this checkout, the ignored `.scratch/host-hermes/build/bin/hermesc` wrapper invokes that compiler through QEMU. Expo selects it through its existing `REACT_NATIVE_OVERRIDE_HERMES_DIR` support. The ignored `.scratch/native-host-env.sh` sets that override and `FFB_OPENSSL_PREFIX` for subsequent shell commands:

```sh
source .scratch/native-host-env.sh
bun run test:native-key-crypto
SENTRY_DISABLE_AUTO_UPLOAD=true SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=true \
  bun run check:production-e2e-bundle
```

These paths and installed tools are local host setup. A different host/checkout must establish its own prefix and wrapper. Expo's override alone does not reconfigure Gradle's separately configured `react.hermesCommand`; the subsequent `scripts/build-android-verification.sh` helper forwards it through a temporary Gradle initialization script.

The production command above **passed with bytecode enabled** and both Sentry upload-disable flags set to literal `true`. It exported one Android and one iOS `.hbc` bundle; both files independently passed the Hermes magic-header and HBC version-98 checks. The existing production E2E marker check passed over both generated bundles. This closes the earlier host bytecode-compilation gap, while compiled APK/IPA and installed Release validation remain separate gates.

Host metadata, dependency-lock/compiler hashes and logs are retained under ignored `artifacts/native-host-verification-2026-10-17/`. Host C++ tests and exported bytecode do not establish native vault, native SQLite, picker, lifecycle or installed Release application behavior.

Subsequent [native-device preparation](./native-device-verification-plan.md#local-preparation-record-2026-10-17) completed Android normal/E2E Release-derived verification app APKs and instrumentation on this host. Packaged Hermes version-98 bytecode, APK signatures, the disposable application ID and instrumentation target were checked; the normal APK's extracted bundle passed the existing test-marker exclusion check with its embedded E2E capability disabled. Native ABI selection and QEMU AAPT2 CPU issues found during compilation were corrected. No device was connected, so installation, native vault/SQLite/picker/lifecycle behavior and the native A–E adapter remain pending. Signed iOS application builds still require a compatible macOS/Xcode host.
