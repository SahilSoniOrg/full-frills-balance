# Onboarding improvement plan

Status: implementation proposal. Product code is unchanged.

Prepared against `b3921efb2` on 2026-11-14. Source inspection informed this plan; no tests, builds, device checks, or visual critique were run. The previously reported 20/40 critique is historical evidence, not a reproduced baseline.

## 1. Outcome and scope

The outcome is a credible first Safe to Spend estimate with a clear explanation of its inputs. Completing a wizard is a supporting metric, not the product outcome.

Keep these decisions:

- Use the conversational surface for first-run creation, creation on an empty registered device, and adding another workplace.
- Preserve the sequence: Welcome → Currency → Accounts → Income → Payments → Monthly limits → Result. Welcome is omitted when the device identity already exists. There are six counted progress steps; Welcome is uncounted.
- Do not add a workplace-name step. Generate a distinct default name; preserve names and icons already entered in migrated drafts. Later editing remains in Settings.
- Keep the four restore journeys and their wizard: `first_run_restore`, `empty_device_restore`, `picker_restore`, `settings_restore`.
- Consolidate onboarding copy, creation state, and progress presentation without building a general workflow framework.
- Preserve the incumbent visual identity. This is a behavior and usability improvement, not a visual-world replacement.

Do not expand into authentication, bank connections, financial-model changes, a new post-onboarding task system, or a general rewrite of account/payment/budget services.

### What changes from the original plan

1. Define Skip and input validity before editing handlers. Keeping rows and advancing unconditionally would bypass the existing checks.
2. Implement persistence, migration, and publication recovery before rerouting or deleting the old creation flow.
3. Treat a registered device with no workplaces as its own entry context, not as a new device.
4. Preserve resumable legacy state. Accepted legacy output is persisted and reloaded today; “never resumable” is not a valid reason to discard it.
5. Keep type chips as add actions. Multiple bank accounts, subscriptions, or income sources of the same type are valid.
6. Measure activation and time to value. A critique score cannot establish that onboarding improved.

## 2. Behavior contracts

### 2.1 Entry, identity, and exit

| Entry context | Creation intent | Entry policy | Start | Device identity writes | Cancel / Back at start |
|---|---|---|---|---|---|
| Unregistered device | `first_run` | Blocking | Welcome | Register and save the entered name after publication | Retain the draft; do not navigate into books |
| Registered device, no usable workplace | `add_workplace` | Blocking | Currency | None; retain the existing identity | Stay in setup; restore remains available |
| Workplace picker | `add_workplace` | Optional | Currency | None | Return to picker |
| Drawer or another existing-workplace entry | `add_workplace` | Optional | Currency | None | Return to the originating page and workplace |

Route intent and entry policy are separate facts. `add_workplace` does not always mean optional. Do not trust a route parameter to override a blocking restore or an incompatible existing session.

Success publishes the new workplace, then asks the Launch Coordinator to open it through the existing transition path. Setup must not independently write an active pointer and navigate around that coordinator.

### 2.2 Continue, Skip, remove, and deferred input

Use these rules for all four collectors:

| State / action | Result |
|---|---|
| Empty collection → “I'll add this later” | Advance; explicitly omit that collection |
| Complete, valid collection → Continue | Include the collection and advance |
| Any collection → “I'll add this later” | Preserve all entered rows locally, mark the collection deferred, exclude it from the estimate and publication, then advance |
| Deferred collection revisited | Restore every field and show “Not included yet”; Continue validates and includes it again |
| Incomplete included collection → Continue | Stay on the step; show the precise field or dependency issue |
| Remove a row | Remove only that row; keep the other rows and their values |

“Later” preserves input during the unfinished session, including app restarts. It does not promise a new task system after onboarding. On Result, list deferred entries and explicitly state that they will not be saved when setup finishes. Provide Edit actions. With deferred entries, the finish action must visibly say it continues without those entries; clearing them is never an undisclosed consequence.

Persist inclusion/defer metadata once in the session, keyed by collector step. Do not maintain a second copy of its item arrays. Returning to a deferred step must not silently include it merely because it rendered.

The existing hidden Skip handlers do not demonstrate a reachable “delete populated list” bug: the current UI exposes them only for empty lists. The actual problems are the disappearing escape action and hidden removal. Fix those without introducing a validation bypass.

### 2.3 Money and dependency validity

- Preserve raw amount text while editing and across resume. Empty, invalid, and valid zero are distinct states.
- A valid zero balance is allowed for bank/cash accounts. Define zero-card handling explicitly as a valid zero-debt state; do not force users to invent debt. Included income, payments, and limits require positive amounts.
- Preserve supported signed asset balances if the existing account model supports overdrafts; do not strip a minus sign and turn debt into cash. Credit-card input describes an amount owed, with its sign handled by the existing mapping.
- Parse using the input locale's decimal and grouping rules, and validate against the currency's supported precision. Reject ambiguous or malformed text instead of guessing. Locale and currency are separate inputs.
- `parseAmount('1.2.3')` already returns `undefined`; `CollectedRow` currently turns that into zero with `?? 0`. Both the parser and its consumers must change.
- Use one preparation/validation boundary to derive numeric, included inputs for projection, review, and commit. Do not persist a second authoritative numeric draft alongside the editable input.
- While an included input is invalid, label the preview incomplete and identify exclusions. Never present its invalid text as a confirmed zero balance.
- Expected income, payments, budgets, and a planned card payment require an eligible spendable account. Use the same eligibility predicate in collection, projection, and commit; unresolved savings eligibility must not pass one layer and fail another.

When the last eligible account is removed, protected, or deferred, retain dependent entries and mark the dependency unresolved. Explain which groups are affected. Offer Add an account or Leave these items for later. Deferring affected groups is an explicit action, not a silent side effect. Finishing is blocked only while included data remains invalid; users can finish with all optional groups deferred.

### 2.4 Recovery and feedback

- Field issues appear beside their fields; dependency and save issues appear above the relevant action.
- Do not show validation errors merely because an untouched optional step is empty. Show guidance initially; show errors after interaction or an attempted action.
- Add-account recovery retains the originating step. Completing the account correction returns there; Back has deterministic behavior and does not create a navigation loop.
- Derive validation from the current session. Do not persist a stale `blockedReason` string after the underlying problem is fixed.
- Screen-reader focus moves to the new step heading or actionable error. Avoid announcing errors repeatedly on every keystroke.

## 3. Architecture boundaries

Respect the repository decisions in:

- `docs/adr/0002-centralize-launch-orchestration-above-books-providers.md`
- `docs/adr/0004-treat-database-publication-as-the-books-commit-point.md`
- `docs/adr/0005-make-workplace-transitions-coordinator-owned.md`
- `docs/adr/0006-compose-setup-from-linear-resumable-slices.md`
- `docs/adr/0006-scoped-navigation-and-workplace-switching.md`

Keep one device-local Setup store and one small launch projection. Add a discriminated conversational session; do not force conversation steps into restore slice history. Narrow the legacy coordinator to the wizard types it actually handles after migration.

The conversational session owns:

- Schema version and creation intent.
- Blocking/optional policy and entry context.
- Stable operation identity, stored once.
- Editable inputs, deferred-step metadata, current step, and valid navigation history.
- Any pending add-account return destination.
- Publication state sufficient to recover after a process exit.

Validation messages, numeric projections, animation state, and analytics payloads are derived, not stored as additional sources of truth. Preserve existing restore serialization through an explicit version-aware reader.

This plan proposes explicit amendments to `docs/specs/user-device-workplace/spec.md` and the slice composition ADR: the creation sequence, durable unaccepted editor input, and the timing of first-run Device registration. Their current accepted-checkpoints-only language and old journey table do not describe this proposal. Update those contracts with the implementation, scoped to creation; retain restore behavior. Store semantic step identities rather than a parallel numeric progress cursor. Do not silently introduce a second store or a generic state-machine engine.

## 4. Implementation phases

### Phase 0 — Establish the implementation baseline

Inspect `OnboardingScreen`, collectors, draft/projection/commit mapping, Setup storage/runtime/routing, launch, and all creation/restore entry and exit paths. Record the current commit and pre-existing worktree changes. Use the approved implementation base; do not reset unrelated work to a historical hash.

Create a route matrix and a small set of realistic fixtures: empty, valid zero, positive cash, negative asset balance where supported, protected savings, card-only, multiple accounts, incomplete entries, and deferred entries.

Record the prior 20/40 critique as unverified history. A comparable visual baseline requires the same device class, theme, text size, fixture, and rubric.

Tests and builds listed below are planned verification. Run them only when explicitly requested. A baseline failure is recorded separately from introduced failures; do not make unrelated repair work a prerequisite without explaining the dependency.

Acceptance: entry/exit ownership, amount policy, and Skip semantics are explicit before code changes begin.

### Phase 1 — Correct the draft, amount, and action model

Primary files: `first-run/draft.ts`, `CollectedRow.tsx`, `collectors.tsx`, `projectCashClarityDraft.ts`, `mapToWorkplaceOutput.ts`, `commitCashClarity.ts`, `spokenConfirm.ts`, `OnboardingScreen.tsx`.

1. Add raw monetary input handling and a shared parser/validator. Reuse existing money utilities where they implement the required locale and precision behavior; do not create a second currency-formatting subsystem.
2. Add per-collector inclusion/defer metadata and a single effective-input preparation function.
3. Make projection, confirmation copy, review, and commit consume the same inclusion rules.
4. Implement Continue and Skip using the behavior table. Keep Skip available after engagement without accepting invalid included input.
5. Add a visible remove button, accessible as “Remove <item name>”, beside every collected row. Keep swipe removal as an accelerator and preserve native accessibility actions where useful.
6. Keep chips as add controls, with explicit “Add bank account” / “Add subscription” accessible labels. Repeated taps create distinct rows with stable IDs. Do not overload `selectedId` to toggle existing rows off.
7. Give name fields appropriate length limits, whitespace handling, and non-destructive editing behavior. Commit names on blur or submission; do not rewrite the user's text on each character.

Acceptance: invalid input never becomes a numeric zero, Skip never destroys session input, deferred input cannot reach projection or publication, and repeated account types remain supported.

### Phase 2 — Durable sessions and lossless legacy migration

Primary files: `SetupDraftStore.ts`, `setupTypes.ts`, `services/setup/setupDraftIdentity.ts`, `services/setup/launchProjection.ts`, `first-run/pendingWorkplace.ts`, `OnboardingScreen.tsx`, and a small explicit creation-session migration module.

1. Extend the Setup store with the conversational session variant and version-aware parsing. Separate restore-wizard types from the overall persisted union so adding a variant does not accidentally make restore effects accept creation data.
2. Persist input edits and transitions through the store's single write path. The store is synchronous today: prefer straightforward writes over a delayed save queue. Persist navigation decisions before navigating.
3. Restore the active step and deferred input on re-entry. Offer Resume / Start over only when an unfinished session exists. Optional creation remains optional on normal launch.
4. Starting over explicitly discards the unfinished session; keep committed workplaces untouched. Resume never allocates a new operation ID.
5. Replace the independent `cash_clarity_pending_workplace_id` mechanism with session-owned operation identity. An old bare pending ID is not proof that an existing workplace is safe to reuse or delete.

Legacy migration rules:

| Existing state | Required handling |
|---|---|
| Valid restore draft | Continue to read and resume it; preserve source ownership, handoffs, and entry policy |
| Empty legacy creation draft | Convert to the matching conversational entry context |
| Legacy creation with accepted workplace output | Preserve operation ID, policy, name, icon, currency, selected accounts, categories, and provenance; map to the earliest unresolved conversation step |
| Accepted starter records outside the four conversational presets | Normalize their exact IDs/types/icons into preserved account/category definitions; show them in review and carry them into publication without inventing a subtype or balance |
| Legacy summary already accepted | Show the new Result for review; do not auto-publish a migrated draft |
| Malformed or unsupported-version draft | Keep the original payload for recovery; show an explicit restart action rather than silently deleting it |

Migrate only accepted persisted facts. Do not claim recovery of characters that the old screen never saved. Convert into a new payload before replacing the old value; a failed migration must leave the original recoverable. The migration adapter is compatibility code, not a retained second creation wizard.

Preserved starter definitions are metadata, not balance assertions. They may publish an account/category definition without an opening journal; the result identifies its balance as not provided and excludes it from the estimate. If the user supplies a balance, normal validation and publication apply. Preserve each definition once in the canonical session, rather than carrying a second legacy workplace output through runtime. Never silently reduce an arbitrary liability to a credit card or discard a custom category.

Single-store contention is explicit: opening Restore or another creation intent cannot overwrite an unfinished session without a Resume / Discard decision. Changing intent never retargets an existing operation ID.

Acceptance: process termination restores the same input and operation, old restore drafts remain readable, and no valid legacy creation output is silently lost.

### Phase 3 — Publish once and recover safely

Primary files: `commitCashClarity.ts`, `setupFinishers.ts`, `mapToWorkplaceOutput.ts`, the existing account/payment/budget write boundaries needed for setup publication, and `LaunchCoordinator.tsx`.

The current cash-clarity finisher creates the workplace and then performs additional writes. Its in-memory queue is not crash recovery. Bring this path into the repository's publication contract before broadening access to it.

1. Validate the entire included payload before any database write. Reject non-finite numbers, invalid dates, missing references, and unresolved dependencies at this boundary too.
2. Freeze the submitted payload while saving. Disable repeated submit and editing until the attempt resolves.
3. Publish the workplace and all included setup records in one database transaction: selected accounts/categories, opening balances, account subtype settings, planned entries, and budgets. Extract the minimum transaction-compatible builders needed; do not nest existing writer commands or redesign unrelated service APIs.
4. Retain stable operation and item identities so retries cannot duplicate accounts, planned entries, budgets, or opening journals.
5. Recover an already-published operation by verifying its publication and completing remaining follow-up effects. Persist completion evidence in the same database transaction, reusing existing publication metadata if it provides that guarantee. Row existence from the old multi-write path is not proof of complete publication; preserve ambiguous legacy state for explicit recovery. Never rerun balance adjustments over an already-finished workplace or delete published books because a later preference write failed.
6. Register/name the device only for first-run intent, using idempotent follow-up effects. A registered empty device and additional-workplace creation never rename or re-register it.
7. Emit a typed creation outcome and let the Launch Coordinator validate/open the target. Keep the prior workplace committed until the new transition succeeds.
8. Clear the unfinished session last. A crash after database publication but before activation/cleanup resumes finalization, not a second creation.
9. Map failures to stable user-facing recovery codes. “Check your amount”, “Add a spendable account”, “Could not save”, and “Saved; could not open” need different actions. Do not show raw exception messages or financial data in diagnostics.

Acceptance: interruption before, during, and after publication yields either no published workplace or exactly one complete workplace. Failure to open a saved workplace offers Retry opening, not Create again.

### Phase 4 — Reroute all contexts and preserve restore returns

Primary files: `OnboardingRoute.tsx`, `setupRouting.ts`, `setupRuntime.ts`, `SetupScreen.tsx`, `launchResolver.ts`, `LaunchCoordinator.tsx`, `NavigationDrawer.tsx`, `utils/navigation.ts`, and `setupRecipes.ts`.

1. Define one typed creation navigation helper with intent and origin. Replace the creation entry points with that helper.
2. Update `OnboardingRoute` and `shouldShowCashClarity` explicitly. The current predicate rejects every route journey except `first_run`; adding an `add_workplace` parameter alone does not enable the surface.
3. Route a registered empty device to the blocking add-workplace context. Update both the pure launch resolver and the missing-active-workplace fallback in `LaunchCoordinator`.
4. Preserve the previously active workplace and exact originating page on optional creation cancellation. Close/dismiss the creation route correctly; do not leave it below the user's destination.
5. Keep restore selection available before entering financial data. The empty registered-device context must still reach `empty_device_restore`; optional contexts retain the existing picker/settings restore distinction.
6. Update every restore Back/discard destination. In particular, `empty_device_restore` currently names `empty_device_workplace` in both `atStart` and `discardTo`; replace these with the equivalent typed creation destination before removing that legacy recipe.
7. Normalize old `create_workplace`, `empty_device_workplace`, and `mode=full` links into canonical creation entries. Keep aliases at the route boundary only; do not retain old recipes as active flow definitions.
8. Respect a blocking restore or unfinished incompatible draft. Route normalization must not overwrite it.

Acceptance: every row of the entry matrix works for start, Back, cancel, restore, restart, success, and failed activation. Additional creation leaves existing books unchanged until the user completes publication and switching.

### Phase 5 — Remove retired creation surfaces

Once migration, publication, and routing meet their acceptance criteria, delete:

- The two legacy creation recipes and their active runtime branches.
- `WorkplaceCreationSetupDraft` as an active model; retain only the migration decoder.
- The creation-only summary slice/type and screens, after verifying restore parsing compatibility.
- Starter account/category selection surfaces and their starter-only branches.
- The separate pending-workplace key's active write path.

Keep the restore workplace/identity/currency/device/source/summary surfaces, ownership cleanup, and publication finishers. Keep the shared workplace output required by conversational publication and e2e seeding. Route aliases and old-schema readers remain narrow compatibility boundaries.

Delete tests only for deleted behavior. Adapt the existing `WorkplaceSetupSlice` checkpoint-remount test for imported/restore mode instead of deleting all coverage for a component that remains in use. Preserve migration fixtures and restore regression coverage.

Acceptance: one active creation surface and state model, working compatibility readers, and no dangling creation or restore-return destinations.

### Phase 6 — Inline recovery and native interaction

Primary files: `conversationUi.tsx`, `collectors.tsx`, `CollectedRow.tsx`, `OnboardingScreen.tsx`, `chrome.tsx`, and existing keyboard/layout primitives.

1. Add field guidance and footer validation slots to `ConversationStep`. Render dependency errors and recovery actions above the primary CTA.
2. Replace toast-and-teleport recovery with a durable inline explanation. Preserve an account-repair return destination through navigation and resume. Clear the issue as soon as its predicate resolves.
3. Keep Skip / Continue / Back mounted while the keyboard is visible. Coordinate the footer with the existing keyboard-avoiding page, scroll view, IME/safe-area insets, and compact header; simply removing the conditional render is insufficient.
4. Ensure the focused field and primary action remain reachable together on small screens, including the iOS decimal pad and Android system Back. Fix the footer layout before adding extra persistent feedback above it.
5. Meet the skill's target sizes: at least 44 pt on iOS and 48 dp on Android. Use real layout space without overlapping neighboring targets.
6. Give monetary fields a flexible layout and a stacked fallback at narrow widths or enlarged text. Support long names, large amounts, and zero-decimal currencies.
7. Let text grow and wrap. Do not use `maxFontSizeMultiplier` or shrinking text to conceal a fixed-height layout defect. Use `FitText` only for display amounts/headlines that intentionally fit, with a readable floor.
8. Honor reduced motion and screen-reader order. Use polite announcements for relevant validation changes; avoid duplicate role/live-region announcements and per-keystroke money narration.

Shared `IconButton` and `FilterChipButton` changes have app-wide effects. Prefer an existing accessible size variant for onboarding; if the shared default is deficient and changed, treat that as a separate commit and inspect dense callers. Do not add an onboarding-only copy of a core component.

Acceptance: a user can complete or defer any collector with the keyboard open, without a hidden dismiss gesture, clipped input, or swipe-only removal.

### Phase 7 — Copy, progress, and live feedback

Primary files: `onboardingStrings.ts`, the old `ui-strings.ts` onboarding subtree, `flow.ts`, `chrome.tsx`, `draftTransitionModel.ts`, `WorkplaceSetupLayout.tsx`, and restore consumers.

Copy:

- Put onboarding-specific language in `onboardingStrings.ts`. Keep privacy text in the privacy domain and truly shared picker labels in their shared domain; those components should not depend on onboarding for generic copy.
- Migrate surviving legacy keys after old creation consumers are removed. Search references rather than assuming the quoted count of 52 dead keys is current.
- Standardize “Restore a backup”, “Enter my dashboard”, Back, Continue, and the defer action. Keep field guidance specific enough to explain the actual fix.
- Use plain section names: Money you have, Money on the way, Money set aside, Monthly limits. Ensure “set aside” describes the actual modeled reserve rather than implying money moved between accounts.
- Use locale-aware amount/date interpolation. Describe balances as entered balances, not deposits: “Bank balance set to …” must not imply a real transaction occurred.
- Remove obsolete keys only after checking all consumers. Do not add “every key must be referenced” or “no literal anywhere under setup” grep tests; those are brittle proxies for user-visible correctness.

Progress:

- Create one reusable progress presentation with label, current, total, accessibility value, and reduced-motion behavior.
- Use `Step N of M · Name` consistently. Derive counts from the actual visible flow; do not hardcode four restore steps when imported facts can skip checkpoints.
- Keep restore checkpoint resolution distinct from conversation sequencing. Sharing presentation does not require merging their state models.
- Delete the old progress component once both consumers use the replacement.

Feedback:

- Render a short spoken acknowledgement separately from the estimate-change explanation. Personal acknowledgements never appear as a reason the money number changed.
- Update the estimate from valid effective input. Publish prose after blur or a 600 ms pause; cancel stale timers on step change/unmount and calculate the explanation against a stable prior acknowledged input, not the last keystroke.
- Show one concise reason inline. Put longer calculation detail behind “How this was calculated”; do not let two feedback lines become a four-line permanent header that crowds out the form.

Acceptance: no debug vocabulary, no false transaction claims, accurate progress in both flow families, and no repeated screen-reader announcements while typing.

### Phase 8 — Honest result and proportionate privacy

Primary files: `wrap.tsx`, `useClaritySceneViewModel.ts`, `clarityChart.tsx`, `welcome.tsx`, `privacyNoticeStrings.ts`, and `PrivacyAcknowledgementSheet` consumers.

Result:

1. Distinguish no usable input, a valid computed zero, positive availability, and a shortfall. An empty draft is not evidence that the user can safely spend zero.
2. Make the time window, included assumptions, and omitted/deferred inputs visible near the result. Expected income must not sound available today.
3. Give zero and negative results equal layout quality and readable emphasis. Explain a shortfall without celebratory copy.
4. Use one amount format with currency-appropriate precision in the header, result, and dashboard comparison.
5. Provide edit actions for the relevant collection without adding a new step. Returning from an edit restores Result predictably.
6. Place save/open errors above the footer action. Display the action appropriate to the publication state and preserve all recoverable input.
7. Match the post-commit dashboard using the same clock, currency, projection window, and normalized included inputs. Document rounding tolerances; do not accept unexplained differences.

Privacy:

- Keep a short, accurate privacy summary before financial collection and before restore begins. Do not move a mandatory acknowledgement to after the user types an account balance.
- Replace the long first-run interstitial with the existing Local by default callout and three short bullets covering local records/backups, limited online processing/analytics, and optional capture/voice features. Keep the full policy directly reachable.
- Preserve material caveats: local storage and exported backups lack separate app-level encryption; some optional features use external services. “Local by default” must not become a blanket “nothing leaves your device” claim.
- Preserve policy version and acknowledgement behavior. Check restore, skipped-account, resumed-session, and add-workplace paths; none may accidentally bypass a required acknowledgement.
- Keep feature-specific explanations at the point of enabling those features. This is a content and UX change; it does not assert legal compliance.

Acceptance: users understand what produced the number, can distinguish unknown from zero, can fix an omission, and see the privacy promise before supplying financial details.

### Phase 9 — Measure outcomes before rollout

Instrumentation must be available before evaluating the new flow. It can land earlier as a separate small change once event semantics are defined.

Add events for flow start/resume/restart, step viewed, step completed/deferred, validation blocked, result viewed, save outcome, and first dashboard opened. Include only allowlisted categorical metadata and durations: flow version, intent/context, step, action, resumed status, and bounded error code. Define step views and retries so Back/Forward and remounts do not inflate completion counts.

Register these names, property schemas, and permitted token values in `src/utils/observabilityPrivacy.ts`; the current sanitizer drops unknown events. Never include names, amounts, balances, row labels, free-text errors, backup filenames, or serialized drafts. Confirm analytics delivery still respects existing privacy settings and acknowledgement behavior.

Evaluate:

- Start → first usable estimate → Result → saved → dashboard conversion, split by entry context.
- Time to first usable estimate and time to completion, with resumed sessions separated.
- Per-step abandonment, defer rate, account-repair loops, and save/open failure rates.
- Whether users understand what is included; task-based comprehension checks complement telemetry.

Set improvement targets after collecting the baseline. Do not invent percentage gains or use the historical critique score as an activation target. The first usable estimate must already be visible after a valid eligible account input, before optional collectors are completed.

Acceptance: usable baseline and post-change activation measurements, segmented by creation context, with events that survive the privacy sanitizer.

### Phase 10 — Verification and handoff

No verification commands are executed by creating this plan. During implementation, add focused regression coverage where it protects the behavior below. Run tests only after an explicit request; report unrun checks plainly.

#### Behavior coverage

| Area | Required scenarios |
|---|---|
| Amounts | Blank vs zero; valid zero debt; locale decimal/grouping; malformed input; supported negative asset balance; currency precision and finite-value checks |
| Defer | Empty/nonempty/incomplete collections; retention through Back/Forward and restart; exclusion from preview and publication; visible final omission |
| Dependencies | Savings undecided/protected; card-only; last spendable account removed/deferred; recovery and return; fully deferred completion |
| Multiplicity | Multiple banks/cards/income sources/subscriptions with distinct stable IDs |
| Persistence | Mid-field process exit; version migration; incompatible intent; explicit restart; unreadable payload recovery |
| Legacy | Accepted custom name/icon/currency/accounts/categories preserved; unsupported preset records retained; restore draft unchanged |
| Publication | Repeated submit; retry; transaction failure; process exit around publication/activation/cleanup; saved-but-not-opened state; no duplicate journals or plans |
| Navigation | Every entry matrix row; stale active ID; old links; all restore Back/discard outcomes; prior workplace/page retained on cancel |
| Result | Unknown, zero, positive, negative; omissions; long amounts; projection/dashboard agreement |
| Privacy/analytics | Gate on all paths; new events accepted; sensitive properties rejected; no per-keystroke event emission |

#### Commands available when requested

```sh
bun run typecheck
bun run lint
bun run check:architecture
bun run check:privacy-policy
bun run test:ci
bun run e2e:build:web
bun run e2e:test:web
bun run e2e:build:ios
bun run e2e:test:ios
bun run e2e:build:android
bun run e2e:test:android
```

Use focused affected suites while iterating and the wider gates for the final candidate when requested. The e2e commands above can run broader suites than onboarding; pass the supported spec filters for targeted checks. Record platform/environment blockers rather than claiming a platform passed.

For an explicitly requested visual/device verification pass, inspect the shipped device classes on iOS and Android, plus the supported web fallback. Batch the first inspection across keyboard-open/closed, light/dark, enlarged text, narrow width, and the four result states. Fix the observed issues together, confirm once, and stop. Use native-device evidence for native keyboard and gesture claims.

Repeat the same critique rubric and fixtures only after the baseline is reproducible. Report the evidence alongside any score.

Handoff includes the behavior changes, migration policy, known limitations, verification actually performed, and commands still unrun. Do not push, publish, or deploy as a side effect of finishing the local implementation.

## 5. Delivery sequence

Use these reviewable slices, each leaving the app in a coherent state:

1. Amount validity, shared inclusion rules, safe defer, and visible removal.
2. Versioned conversational persistence and legacy migration, with old routes still available.
3. Atomic publication, retry/finalization, and coordinator-owned activation.
4. Entry/return routing for all contexts, including restore exits and legacy aliases.
5. Remove retired creation surfaces; consolidate surviving copy and progress.
6. Complete inline recovery, keyboard/touch/layout fixes, result states, and privacy summary.
7. Confirm instrumentation and complete explicitly requested regression/device verification.

Keyboard fixes and instrumentation may ship earlier when isolated. Source overlap does not make conceptual changes independent: defer semantics affect validation, projection, persistence, confirmations, review, and commit. Do not split those invariants across competing branches. No parallel-agent workflow is required by this plan.

## 6. Completion criteria

Implementation is complete when:

- Every creation entry uses the conversational surface with the correct policy and identity behavior.
- No navigation action silently destroys entered session data or includes deferred/invalid money.
- Unfinished sessions and accepted legacy facts survive restart and migration.
- Publication and activation recover without duplicate records, partial books, or lost prior workplace scope.
- Restore journeys keep their functionality and correct return destinations.
- Keyboard, text scaling, touch targets, errors, and result states are usable on the supported platforms, with any unverified claims explicitly identified.
- Onboarding copy and progress presentation have one owner each; no unused creation wizard remains.
- Activation can be measured through the existing privacy boundary.
- All verification performed and all remaining checks are reported accurately.
