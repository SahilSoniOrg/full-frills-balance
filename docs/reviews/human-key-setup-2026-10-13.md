# Human local key setup and recovery

Date: 13 October 2026. Verdict: **Local workflow implemented and Android-tested; physical-device and online release gates remain open.**

## Result

Settings → Data & Backup → Private backup & recovery now deliberately creates the stable local User, independent Device and active Workplace’s one DEK. The welcome screen also offers User recovery on a fresh installation, behind the existing privacy acknowledgement. Opening either entry creates no keys. Ordinary local books and plaintext ZIP export retain their existing behavior.

Setup exports three separate files: a User recovery secret, a Workplace emergency secret, and a User-signed encrypted package for one Workplace. Both secrets must reopen their exact staged envelopes. The encrypted package must be reopened, signature/hash checked and decrypted before export is confirmed. Dismissal of an export sheet never counts as verification. The Workplace credential remains dump-only; no hosted emergency-download API or restore-as-copy UI is delivered.

The package signature authenticates the complete User-recovery object, Workplace envelope/usage record and encrypted snapshot against the independently saved full User identity pin. It uses the already provisioned Ed25519 User signing key; no User, credential or DEK migration is introduced. HPKE encryption alone is still not sender authentication. Hosted registration, owner grants, authenticated checkpoints and signed online publication remain separate protocol requirements.

Recovery checks the signature and recovery secret before durable setup writes, creates an independent Device, and restores the same User encryption/signing keys and DEK. A matching pre-existing local key binding allows key-access recovery with current books and preferences retained. Missing books use the atomic idempotent original-ID restore path; unrelated local collisions still reject. Repeated recovery does not duplicate books. A replacement Device stays read-only for backup encryption pending writer handover. If an established Workplace marker survives but its usage record is lost, the uncertain encryption budget is exhausted rather than reset from an older package.

## Persistence and interruption

- Setup checkpoints contain public IDs, identity pin, intent and an encrypted-file reference/digest only. They contain neither recovery phrase nor readable keys/books. Known-User intent and enrollment markers prevent missing storage from silently becoming new-root permission.
- Pending setup resumes the same keys. Explicit discard is limited to an unfinished step on which no established encrypted data depends. Missing established material offers recovery; corrupt/inaccessible state fails closed. Repair of every corruption combination remains unproved.
- User private keys and the DEK are borrowed and cleared per operation. Secrets selected/generated in the UI are dropped on blur, background and app lock. Recovery publication intent remains cancelled after a background/lock transition even if the app subsequently returns/unlocks.
- Native picker transitions also clear secrets, so recovery selects the encrypted package first and the User secret last. A regression test protects that order and verifies that only ciphertext survives backgrounding.
- Android export writes directly to a user-selected document folder. iOS requires temporary sharing/import copies; the adapter deletes its copies after success/error and purges its abandoned recovery-cache namespace at startup. The SDK adapter tests cover those paths; physical iOS picker behavior and crash windows remain open. File deletion and JavaScript reference clearing are not a physical-erasure guarantee.
- Device backup-access removal requires a verified saved package. It removes the Device key and local User-bundle reference, retains known-User recovery intent and the encrypted package, and leaves ordinary local books in place. Retained ciphertext can be read/exported without the lost Device key. This is neither remote revocation nor a data wipe.

The local source is a replaceable persistent-store adapter. Phase 2 will retrieve encrypted User bundles/envelopes/snapshots from the backend; recovery phrases and private keys never cross that boundary. A phrase cannot reconstruct absent ciphertext. Supabase Auth and storage are the current planned provider, confirmed by the user; no project/integration has been created and repository placement/login method remain undecided. The rejected placeholder SQL stays deleted.

## Verification

| Check                                                                    | Result                                                                                                                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final full application suite                                             | 543 suites, 3,854 tests, 9 snapshots passed.                                                                                                                                      |
| Application/E2E TypeScript                                               | Passed.                                                                                                                                                                           |
| Changed-code lint                                                        | Passed. Repository lint has zero errors and one existing warning in `useJournalSuggestions.ts`.                                                                                   |
| Architecture and privacy-policy guards                                   | Passed; route registry contains 43 routes.                                                                                                                                        |
| Final Android Release app/instrumentation build                          | Passed; Sentry artifact upload tasks skipped.                                                                                                                                     |
| Native key/package cases on two disposable API 36 Google APIs arm64 AVDs | Creation/signature/tamper checks, process restart, fresh replacement on a second AVD, actual uninstall/reinstall, injected missing Device key and injected orphan key all passed. |
| Final native normal-app UI cases                                         | Fresh-install recovery/privacy entry; Settings User creation and process-restart resume both passed.                                                                              |

The key harness executes real QuickCrypto, HPKE, SecureStore, AsyncStorage and WatermelonDB APIs. It verifies the signed package before recovery and rejects an altered signature at creation. Root access only transfers disposable fixtures with the current sandbox UID/SELinux label; SELinux remains enforced. The human UI test exercises the ordinary app shell and deliberately does not automatically export secrets.

The first UI run failed because its assertion used a matcher unsupported by Detox. Replacing that assertion with native element attributes fixed the test; no product behavior was weakened. Android cold launches also emitted transient Detox connection warnings; final tests completed successfully. The package and file workflow tests cover valid forged-envelope substitution, wrong secrets before writes, duplicate-safe restore, interrupted export retry, missing usage, retained ciphertext and Device removal. File picker/share adapters are exercised with mocked OS surfaces: a complete real-picker saved-file setup/recovery round trip is still a gate, not claimed here.

The six nonsecret native case results are consolidated in [the verification summary](./key-management-verification-2026-10-13.json). Screenshots and superseded per-run artifacts have been removed. Credential-bearing fixtures and both disposable AVDs were removed after verification; the user's existing AVD remains untouched. Earlier iOS runs predate this signing/storage/UI work and do not prove it.

## PR review fixes

Review at `1fc28f31` found three workflow failures, reproduced before fixing: removing Device access then recovering attempted to republish retained books; a surviving empty-device setup draft overrode successful recovery at the next launch; and a missing pending export file had no abandonment path.

Recovery now distinguishes key-access restoration from publishing missing books. Setup owns completion of the satisfied, unchanged empty-device creation gate after activation; failed recovery and changed/unrelated drafts remain intact. An explicit confirmed action abandons only an unfinished package checkpoint, without reading the missing file, changing keys or reclaiming encryption usage. Preparing its replacement spends a new invocation. Regression coverage includes newer local books/preferences, unbound collisions, launch after completion, interruption and failed abandonment persistence. These follow-up fixes are automated-test verified; native file-picker and physical-device gates remain open.

## Open gates

Physical iPhone/Android and cross-platform recovery; complete kill/storage-denial/corruption matrix; native saved-file export/import and cancellation; iOS picker temporary-copy cleanup under crashes; app-lock/background behavior on real devices; memory and file/pointer durability. Online work still requires explicit account-to-existing-User binding, Device request signing/registration, signed owner/publication manifests, authorization/challenges/consent, immutable storage and acknowledgements, checkpoints, retention/deletion, schema evolution and single-writer handover.

## Unintended build-artifact uploads

Two earlier Android builds used `SENTRY_DISABLE_AUTO_UPLOAD=1`; the installed integration requires the literal `true`. They uploaded JavaScript/source maps to Sentry project `full-frills-balance / react-native`, release `in.sahilsoni.fullfrillsbalance@1.0.0+1`, distribution 1. Recovery phrases and generated financial fixtures were not part of those artifacts.

Bundle IDs `9a64ad56-a282-5ec3-8023-d9c69ee99281` and `9cee3dbf-a88e-5349-aa5b-aceee7d2ca0e` remain pending user-authorized deletion. E2E Release configuration now sets both Sentry upload-disable flags to `true`; all builds in this follow-up skipped upload tasks. No external deletion or backend provisioning occurred.

This implements the local human workflow. It does not claim that cloud backup, synchronization or the release milestone shipped.
