# State machines: ownership before frameworks

AUDIT COVERAGE

- Repository: full-frills-balance
- Source inventory: 2,004 files across `src`, `app`, local Expo modules, Android app sources and iOS sources.
- Runtime source files accounted for: 1,352, including 26 native files.
- Excluded from runtime discovery: 652 test/support/declaration files. Relevant existing tests were also read to understand changed contracts.
- Runtime files with syntactic state/lifecycle signals: 699. This is **not** a count of state machines.
- Focused implementation flows traced: observable enrichment, paginated enrichment/retry, journal suggestion requests, editor hydration, voice parsing/application, inbox dialog selection.
- Status: **AUDIT INCOMPLETE**. Syntax discovery covers the listed roots; exhaustive semantic analysis, native lifecycle analysis, cross-partition dependency verification and runtime validation do not. No assertion that every implicit machine has been found or that behavior is regression-free.

The reproducible [inventory](STATE_MACHINE_INVENTORY.md) gives source links, lines and state evidence. Run `node scripts/inventory-state-machines.mjs --json` for every source file, including exclusions and files without signals. Discovery does not execute app code or tests. Native files are explicitly pending, rather than silently omitted. Mutable bindings, collections, effects and unions can be ordinary computation, not lifecycle state. Imported state, native callbacks, navigation and persisted records require semantic review even in files without syntax signals.

## Decision

**Fixable.** Keep state machines next to the module that owns their effects. Use a discriminated union when alternatives exclude one another; keep genuinely independent axes independent. Preserve existing explicit domain transitions and database transaction boundaries. Do not introduce a state-machine package or a global event dispatcher.

The highest leverage defect is **authority without identity**: stale data or completion callbacks remain usable after the workplace, editor mode, text or operation changes. A prettier state diagram does not fix that. Current request identity and terminal transitions must govern what the UI can show and apply.

UX benefits from correct account routes, current parsed amounts, recoverable list failures and one active dialog. DX benefits from local types and preserved hook contracts. AX benefits from named owners, concrete invariants, source links and repeatable discovery. These improvements do not establish that every future change will improve all three dimensions; that requires reviewing each change's tradeoffs.

## Machine catalogue

This is a source-backed navigation map of machine families discovered during the sweep. Rows outside the six focused flows are review entry points, **not certified implementations**. A single family can contain several coupled machines.

| Family                               | Owners / state evidence                                                                                                                                         | Decision / invariant                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup readiness                    | `src/contexts/app-shell/AppReadyProvider.tsx`, `src/features/app/hooks/useAppBootstrap.ts`                                                                      | Preference initialization, font readiness and data hydration are separate axes. Keep the readiness projection; review failure and remount paths.                                                    |
| Splash handoff                       | `src/features/app/splashHandoff.ts`, `src/features/app/RootLayout.tsx`                                                                                          | Native splash ownership differs from preference readiness. Review hide ordering and disposal.                                                                                                       |
| Launch resolution                    | `src/services/launch/launchResolver.ts`, `src/features/app/LaunchCoordinator.tsx`                                                                               | Existing `loading/error/setup/picker/open` union is useful. Discovery, pointer repair and fallback probing remain separate async work.                                                              |
| Workplace switching and deletion     | `src/features/app/hooks/useWorkplaceTransitions.ts`, `src/services/WorkplaceService.ts`, `src/contexts/WorkplaceContext.tsx`                                    | Preserve queued transitions, provider-commit acknowledgement, deadlines, rollback and deletion ownership. Do not replace with a single `busy` boolean.                                              |
| Lock and biometrics                  | `src/contexts/app-shell/AppLockProvider.tsx`, `src/features/app/hooks/useAppLockEngine.ts`                                                                      | Active/background state, unlock history and native authentication overlap intentionally. Review same-tick prompt admission and timer cleanup separately.                                            |
| Restart protection                   | `src/contexts/app-shell/AppRestartProvider.tsx`, `src/services/update/updateRestartGuard.ts`                                                                    | Restart requirements and dirty-draft guards are separate from update delivery.                                                                                                                      |
| Update delivery                      | `src/services/update/playUpdateDelivery.ts`, `src/services/update/appUpdateService.ts`                                                                          | Preserve existing reducer, artifact metadata and native callback revisions. Access policy and download phase are independent.                                                                       |
| Setup orchestration                  | `src/features/setup/SetupCoordinator.ts`, `resolveNextSetupAction.ts`, `setupTypes.ts`, `SetupDraftStore.ts`                                                    | Existing typed `present/auto_accept/run_effect/finish` protocol owns resumability. Accepted slices and displayed history have different meanings.                                                   |
| First-run conversation               | `src/features/setup/first-run/OnboardingScreen.tsx`, `flow.ts`, `draft.ts`                                                                                      | Step, history, draft, commit busy/error and spoken feedback form a composite machine. Preserve the single flow definition.                                                                          |
| Restore preparation/publication      | `src/services/import/prepareRestore.ts`, `publishRestore.ts`, `restorePublicationClaims.ts`, `src/features/setup/SetupScreen.tsx`                               | Preparation is not durable publication. Preserve operation/fingerprint claims, atomic import and recovery handoffs. Review interrupted finalization.                                                |
| Sharing/export                       | `src/services/sharing/SharingRuntime.ts`, `src/types/sharing.ts`, `src/features/settings/hooks/useDataExportViewModel.ts`                                       | Existing operation owner handles preparing, destination selection, confirmation, delivery, cancellation and cleanup. A final native handoff is not proof the recipient saved the file.              |
| Ordinary observations                | `src/hooks/useObservable.ts`                                                                                                                                    | Keep scope-aware seeds and subscription lifetime. Changed enriched observations must respect terminal stream errors and clear recovered enrichment errors.                                          |
| Pagination                           | `src/hooks/usePaginatedObservable.ts`                                                                                                                           | Initial loading, loading more, failure and retry need explicit settlement. Changed to handle stream errors, retain rows and reject late enrichment after terminal failure.                          |
| Journal suggestions                  | `src/features/journal/hooks/useJournalSuggestions.ts`                                                                                                           | Disabled/requesting/settled plus retained results. Keep prior results only across query edits within the same workplace, page and transaction type.                                                 |
| Editor hydration                     | `src/features/journal/entry/hooks/useJournalEditorLoader.ts`                                                                                                    | `idle/loading/loaded/not_found/error`. Completion belongs to `(workplaceId, journalId)`, rather than journal ID alone.                                                                              |
| Journal modes/draft                  | `src/features/journal/entry/hooks/useTransactionComposerSession.ts`, `useJournalEntryModeState.ts`, `useJournalEditorLineState.ts`, `useBatchJournalSession.ts` | Existing canonical draft and derived posting plan are valuable. Basic/expert/allocation/batch capabilities depend on line structure.                                                                |
| Account picker continuation          | `src/features/journal/entry/hooks/useJournalEntryAccountPicker.ts`                                                                                              | Open target, pending next line, dismissal and fallback timer form a handoff machine. Preserve row/role target identities; review cancellation paths.                                                |
| Voice input                          | `src/features/journal/entry/hooks/useVoiceJournalParse.ts`, `src/features/journal/entry/components/VoiceInputModal.tsx`                                         | Parsing is now `idle/parsing/settled`, scoped to modal session and text, with latest-request ownership. Native speech/permission lifecycle remains separately reviewable.                           |
| Journal submission                   | `src/features/journal/entry/hooks/useJournalEditorSubmission.ts`                                                                                                | Existing synchronous in-flight ref prevents duplicate admission before React renders busy. Preserve durable commit vs post-commit effect separation.                                                |
| Unsaved navigation                   | `src/features/journal/entry/hooks/useJournalEntryLeaveGuard.ts`                                                                                                 | Baseline capture, dirty comparison, confirmation and leaving are distinct stages. Keep restart and navigation guards tied to the same dirty draft.                                                  |
| FX resolution/review                 | `src/domain/accounting/fxPair.ts`, `src/hooks/useCrossCurrencyRates.ts`, `src/hooks/usePlannedPaymentFx.ts`, journal rate hooks                                 | Idle/loading/resolved/unavailable plus manual overrides and historical date identity. Do not collapse manual vs fetched values.                                                                     |
| Journal persistence                  | `src/types/enums.ts`, `src/data/repositories/journal/journalLifecycleOperations.ts`, `src/services/journal/journalDomainService.ts`                             | Draft/posted/reversed/planned/skipped/paused coexist with soft deletion. Preserve accounting validation, snapshot guards, matching delete tokens and audit atomicity.                               |
| Planned-payment lifecycle            | `src/services/planned-payment/plannedPaymentLifecycle.ts`, `plannedPaymentOrchestration.ts`, `plannedOccurrenceSettlement.ts`                                   | Active/paused/completed schedules differ from occurrence-journal status and horizon cursors. Review their joint write boundary before changing transitions.                                         |
| Account lifecycle                    | `src/services/accounts/accountArchiveCommands.ts`, `accountDeleteCommands.ts`, `accountMergeCommands.ts`, `accountAuditState.ts`                                | Archived/deleted/merged/active identity and hierarchy membership affect references and undo. Preserve commands and strict audit date decoding.                                                      |
| Account save workflow                | `src/features/accounts/hooks/useAccountPersistence.ts`, `src/navigation/boundWorkplace.ts`                                                                      | Bound-workplace check and synchronous submission ownership precede writes; account save and classified balance adjustment need separate analysis.                                                   |
| Inbox parse/disposition              | `src/types/enums.ts`, `src/domain/transaction-intelligence/captureTransition.ts`, `src/services/transaction-intelligence/transactionCaptureService.ts`          | Parse outcome, disposition, confidence and user-confirmed allocations are different axes. Keep explicit capture-confirmation rejection reasons.                                                     |
| Inbox dialogs                        | `src/features/settings/hooks/useTransactionInboxModals.ts`                                                                                                      | Now `closed/duplicate/editReparse` with workplace-scoped item identity. One dialog owns the selection; dismissing another kind cannot close it.                                                     |
| Capture mutations                    | `src/features/settings/hooks/useCaptureMutationRunner.ts`                                                                                                       | Existing lock and generation gate handle admission, confirmation and scope changes. Preserve synchronous locking.                                                                                   |
| Automatic SMS                        | `src/services/sms/AutomaticSmsImportService.ts`, `src/services/sms/pipeline/smsSyncPipeline.ts`                                                                 | Settings permission generation, queued rescan requests, active run, cursor and retries are separate state dimensions.                                                                               |
| Recognition refresh                  | `src/services/sms/refreshSmsRecognition.ts`                                                                                                                     | Existing per-workplace generation, active-mutation count and ready/updating/failed projection coordinate overlapping edits.                                                                         |
| Gmail                                | `src/services/email/gmailSyncService.ts`, `gmailAuthorization.ts`, `gmailConnection.ts`, settings/app lifecycle hooks                                           | Binding/auth state, coalesced sync, cancellation, retry and history recovery are coupled. Preserve delayed history advancement for retryable messages.                                              |
| Notification intent                  | `src/services/sms/SmsNotificationIntentStore.ts`, `src/features/app/hooks/useSmsNotificationLifecycle.ts`                                                       | Pending/handled durable response identity, launch gates and workplace targeting must agree. Repeated taps must not replay a completed response.                                                     |
| Native SMS/notifications/widgets     | `modules/expo-sms-inbox`, `modules/expo-notification-theme`, Android widget providers, `ios/FullFrillsBalanceWidget`                                            | Native permission, receiver/task, widget refresh and intent state are included in discovery but need semantic/native review.                                                                        |
| Balance rebuild queue                | `src/services/RebuildQueueService.ts`, `AccountingRebuildService.ts`                                                                                            | Pending work, processing ownership, retries and dirty projection state are not journal source data. Preserve scheduling and post-commit invalidation.                                               |
| Forecast runner                      | `src/services/simulation/LatestSimulationRunner.ts`                                                                                                             | One running job and one latest pending request. Aborting the caller must not release native worker ownership early.                                                                                 |
| Report queries                       | `src/features/reports-v2/hooks/useReportsV2ViewModel.ts`, `src/services/reports-v2/reportQueryEngine.ts`                                                        | Idle/loading/refreshing/success/error, debounce and run sequence; result identity, stream failure and unmount paths still need focused analysis.                                                    |
| Integrity prompts                    | `src/services/integrity/journalBalanceInsightService.ts`, `src/features/journal/balance-review/useJournalBalanceReviewViewModel.ts`                             | Audit progress, persisted open issue, prompt fingerprint and review/edit state must not become competing sources of accounting truth.                                                               |
| Pager/gesture ownership              | `src/features/navigation/usePrimaryPageTransitions.ts`, `src/hooks/useChartInteraction.ts`, account-tree drag controller                                        | Queued route vs settled read route, chart selection vs transient pan, swipe reservations and drag targets require ownership/release on every exit.                                                  |
| Overlay infrastructure               | `src/components/overlays/AlertContainer.tsx`, `ConfirmDialog.tsx`, `useAfterDismiss.ts`, `src/hooks/useShareable.ts`                                            | Existing alert unions and dismissal continuations are useful. Native presentation availability differs from logical visibility.                                                                     |
| Selection, forms, calendars, filters | Shared hooks, components and feature controllers in the generated inventory                                                                                     | Most state is ordinary data or independent visibility. Refactor only after proving invalid combinations or conflicting ownership; a state-machine framework for every field would worsen DX and AX. |

## Confirmed findings and changes

### P1 — Async read failures do not consistently own the terminal outcome

Files: `src/hooks/usePaginatedObservable.ts`, `src/hooks/useObservable.ts`.

Problem and entropy risk: pagination subscribed with a `next` callback only. A source error bypassed hook error state and left loading active. Both enrichment hooks could publish previously started enrichment after the source had failed. Successful enrichment also left earlier enrichment errors visible. Screens cannot reliably distinguish loading, failed and recovered outcomes under these interleavings.

Primary action: **INLINE** terminal settlement into the owning subscription. Keep data, pagination and effects in their existing hook; reject stale enrichment through the existing sequence counter.

Before: `source failure -> no pagination error handler; pending enrichment -> late success`.

After: `source failure -> invalidate pending enrichment -> error + loading settled`; retry preserves rows; successful emission clears prior enrichment errors.

Review follow-up: failure and retry now reach activity/search, dashboard, account, budget, insight and inbox views. Initial failures render an error instead of a successful empty result; later failures preserve rows with retry. Automatic journal pagination pauses on error. Pull-to-refresh in the inbox also renews its read subscription. Retry retains the current limit for loaded rows and resets to page one for an empty list.

### P1 — Retained journal state omits scope identity

Files: `src/features/journal/hooks/useJournalSuggestions.ts`, `src/features/journal/entry/hooks/useJournalEditorLoader.ts`.

Problem and entropy risk: suggestions retained prior account routes for every request change, including workplace, editor page and transaction type. Editor load status matched only the journal ID while its read was workplace scoped. This permits an old scope's state to authorize the new UI.

Primary action: **LIFT STATE** identity into the owning request result, alongside its existing payload. Suggestions carry a scope key; hydration results carry the workplace ID. Consumers keep their current public API.

Before: `query changes -> render any prior routes`; `same journal ID -> consider hydrated`.

After: `query-only changes -> retain same-scope routes`; `scope changes -> loading with no foreign routes`; `hydrated -> matching workplace and journal`.

### P1 — Voice parse results can outlive the text that authorized them

Files: `src/features/journal/entry/hooks/useVoiceJournalParse.ts`, `src/features/journal/entry/components/VoiceInputModal.tsx`.

Problem and entropy risk: independent parsing/output state allowed overlapping templates to finish out of order. Editing the transcript left the old parsed amount applicable. Closing or changing workplace did not revoke the pending completion.

Primary action: **MERGE** parse flags and result into the local `VoiceParseState` union. Each parse owns its text and modal session; a sequence counter rejects superseded parse requests. Rendering derives `isParsing` and `parserOutput` from the current session and matching transcript. The transcript uses React's ordinary setter: duplicate speech results preserve valid work, different text hides mismatched output, and restoring exactly the parsed text permits its matching result again.

Before: `parse A; parse B; A finishes -> output A / parsing false`.

After: `parse A; parse B; A finishes -> ignored`; only matching text/session can apply. Empty transaction output cannot enable Confirm & Apply. Native recognition and permission behavior were not redesigned.

### P2 — Inbox dialogs have competing selected-item owners

File: `src/features/settings/hooks/useTransactionInboxModals.ts`.

Problem and entropy risk: two nullable selections allowed duplicate and edit/reparse dialogs to be active together. Neither selection encoded its workplace. More dialog kinds would multiply combinations and teardown coordination.

Primary action: **MERGE** selections into a local `InboxModal` union. Closed or one selected kind owns the item and workplace; public selected-item properties are derived.

Before: `duplicateItem + editReparseItem` (four combinations).

After: `closed | duplicate(scope, item) | editReparse(scope, item)`; the wrong dismissal kind is a no-op.

## Refactor order and remaining work

1. **Integrity:** the six focused flows above have local fixes. Tests were added for stream error/retry, terminal-error vs pending enrichment, automatic enrichment recovery, suggestion scope changes, overlapping voice templates, transcript edits and modal reopening. They were not executed. Review native speech permission/recording cancellation, launch probing failures and report result ownership next.
2. **Structural:** finish semantic review of the 699 candidate files and inspect indirect state in files without signals. Trace each request's scope, admission guard, success/failure/cancellation, retry and cleanup across callers. Include all 26 native owners, persistence transitions, startup/update/sharing/workplace interactions and tests that define their contracts. Record exact edges before proposing additional changes.
3. **Cleanup:** only consolidate duplicated owners after confirming they represent the same responsibility. Keep independent axes and well-contained existing machines. Do not turn ordinary form fields into events merely to standardize syntax.

No dependency, persisted schema, ledger status enum or accounting writer contract changed. No external service action was taken. `bun run typecheck` passed with the final production and test edits, and `git diff --check` passed. Tests were not executed. Runtime behavior remains unverified.

The discovery script now reuses `scripts/lib/source-walk.mjs`, including its default excluded build directories, with native-source exclusions supplied as options. Regression coverage also includes duplicate native transcript events, list-bundle error/retry propagation and error-versus-empty presentation. These tests remain unrun.

## Verification for the owner

Tests intentionally unrun. From the repository root:

```sh
bun run typecheck
bun run test --runInBand src/hooks/__tests__/useObservable.test.ts src/hooks/__tests__/usePaginatedObservable.test.ts src/features/journal/hooks/__tests__/useJournalSuggestions.test.ts src/features/journal/entry/hooks/__tests__/useVoiceJournalParse.test.ts src/features/journal/hooks/__tests__/useJournalList.test.ts src/components/journal/__tests__/JournalEntryListView.test.tsx
```

Also exercise rapid template changes, editing a parsed transcript, closing/reopening voice input during parsing, workplace changes while suggestions/hydration are pending, list failure/retry, and switching between duplicate and edit/reparse dialogs. These interactions target lifecycle interleavings that compilation cannot verify.
