# Evidence-driven Planned Payment settlement — implementation plan

**Status:** Implementation landed on `t3/evidence-driven-settlement` (slices 1–5 wired; acceptance stubs still todo). Not merged to main.
**Date:** 2026-11-10
**Durable contract:** [Evidence-driven Planned Payment settlement spec](../specs/evidence-driven-planned-payment-settlement/spec.md)
**Decisions:** [ADR 0010](../adr/0010-evidence-driven-planned-payment-settlement.md), [CONTEXT.md](../../CONTEXT.md)
**Related:** [Automatic transaction capture plan](./automatic-transaction-capture-plan.md), [AUDIT_POST_ADV00183](../architecture/AUDIT_POST_ADV00183.md) (F-04, F-08, F-10, F-16 sequencing)

## Outcome

SMS, email, and Planned Payment writers converge on one journal for one money movement: observation links plus `planned_payment_id`, with evidence-driven settlement when identity is two-sided unique, and inbox Merge into Journal when it is not.

## Constraints from current code

- `processDuePlannedPayments` pre-generates **PLANNED** occurrence journals through `recurringHorizonDays`; `nextOccurrence` advances at generation, not at posting. Posting an existing PLANNED journal claims the occurrence without moving the cursor (`advanceSchedule` is a no-op there).
- `findOccurrenceJournals` treats any non-PLANNED plan-linked journal whose `ORIGINAL_PLANNED_DATE` (else `journal_date`) is on the day as the claim, and ignores leftover PLANNED journals for that day — they linger in forecasts and simulation. Plan attach must write `ORIGINAL_PLANNED_DATE` and retire the PLANNED journal.
- `stagePost` already moves `journal_date` to the post time and records `ORIGINAL_PLANNED_DATE`; revert reads it back. Evidence-driven posts reuse this model.
- `postScheduledJournal` stamps `MetadataSources.MANUAL_POST`; evidence-driven posts need a distinct source.
- `runAccountingWriteSession` wraps `database.write`, which serializes writers on the device. Match-and-write inside one session removes the on-device dual-create race.
- Capture allocations carry `origin` (`uncategorized | user | system | default`) and `confirmedAt`; only unconfirmed `uncategorized` lines are upgrade-eligible.
- Observation auto-link and fuzzy duplicate search only consider **POSTED** / **REVERSED** journals — they never target **PLANNED** occurrence journals (`CaptureReferenceMatchQueries`, `smsDuplicateDetection` / nearby journal queries).
- `prepareUpdate` does not set `plannedPaymentId`; only create/import/merge paths assign it. Plan attach needs an explicit write inside the accounting session.
- Capture channels on `CaptureSourceObservation` remain `sms | voice | email`. Do not model the Planned Payment as a capture channel; keep `planned_payment_id`.
- Gmail sync currently pre-classifies then re-runs ingestion (audit F-04). Shared settle matching must live where both SMS and email actually decide, not only in the discarded pre-pass.
- Inbox “Merge into Journal” today links an observation to an existing journal (`finalizeManualImport`); collapsing two **POSTED** journals still uses bulk/cross-journal merge.
- Manual-FX forces `isAutoPost` false and requires FX review before post. v1 excludes all FX plans from unattended settle.

## Approved module split

| Module | Responsibility |
| --- | --- |
| Shared movement matcher (new, domain/service) | Given workplace + observation facts (or occurrence facts), return hard match, two-sided-unique strict occurrence match, soft/conflict candidates, ambiguous candidates, or none. Owns strict/soft windows (capped by plan interval), soft amount tolerance, ACTIVE/non-SKIPPED/unclaimed/non-FX/not-future filters, reference-conflict exclusion, and same-channel detection for silent attach. Reads inside the caller's write session. |
| Evidence-driven settlement (planned-payment service) | Post an existing PLANNED occurrence or mint one when generation has not run; evidence-driven audit source; refuse FX plans |
| Plan attach (planned-payment service + journal persistence) | Set `plannedPaymentId`, write `ORIGINAL_PLANNED_DATE`, retire the PLANNED journal, apply the eligible Uncategorized upgrade, one undo step |
| Capture pipelines (SMS + Gmail) | Call matcher before `decideCapture` post; settle/link on strict unique; block capture auto-post on soft/ambiguous/conflict |
| Plan settlement (`plannedOccurrenceSettlement`) | For due occurrences only (not future horizon), matcher against capture journals before posting; attach or hold PLANNED on ambiguity |
| Inbox review UI | Merge into Journal candidates include plan-linked **PLANNED**/**POSTED** journals and soft-match occurrences; dual-POSTED survivor prefers sole plan-linked journal |
| Planned payment UI | User Post prompts “link instead?” when a candidate exists; auto-post setting copy |

Prefer one deep matcher with a narrow input/output over copying plan queries into SMS and Gmail separately.

## Implementation order

### 1. Shared movement matcher

- Repository-backed matcher, callable inside an accounting write session, covering: hard reference reuse, reference-conflict exclusion, occurrence candidates (PLANNED journal, claiming POSTED journal, or projected due date when ungenerated), strict window ±1 local day capped below half the plan interval, soft window ±4 days and 5% amount tolerance (tunable constants), two-sided uniqueness against pending observations and unlinked POSTED capture journals, structural-conflict signal, same-channel signal for silent attach.
- Unit tests: unique / two-sided ambiguous / amount mismatch → soft / date +2 → soft / daily-plan window cap / paused / skipped / claimed / FX / future horizon / transfer visible-leg / reference conflict / edited occurrence amount.

**Exit:** SMS, Gmail, and plan settlement can call one matcher without inventing windows or uniqueness rules.

### 2. Plan attach + Uncategorized upgrade

- Accounting-session operation: set `planned_payment_id`, write `ORIGINAL_PLANNED_DATE`, soft-delete the occurrence's PLANNED journal, rewrite the category line only when eligible (unconfirmed `uncategorized` origin, single category line, unedited, same-kind same-currency plan counter-account), resolve that allocation's review, replace description only if still capture-generated, preserve merchants/sources.
- Do not feed plan-driven categories into merchant→category defaults.
- One undoable audit event; undo restores link, lines, description, review state, and the retired PLANNED journal. Cover restore/audit expectations already used by merge/retarget.

**Exit:** A capture journal can become the occurrence journal without delete+recreate, without leaving an orphan PLANNED journal, and reversibly.

### 3. Evidence-driven settlement from observations

- SMS and Gmail, after same-source idempotency, inside one write session:
  - Posting gate: only when `decideCapture` would post.
  - Strict unique PLANNED → post via settlement with plan lines (`journal_date` = observation date, `ORIGINAL_PLANNED_DATE` = occurrence day), link observation, evidence-driven audit source.
  - Strict unique claiming POSTED plan journal → silent attach only for a new channel without reference conflict; same channel → review.
  - Strict unique ungenerated occurrence → mint POSTED plan-linked journal, advance cursor.
  - Soft, structural conflict, or ambiguity → review and block capture auto-post.
- Skip elsewhere-consumed for unattended settle. FX plans → review only.
- Undo of evidence-driven settle returns the journal to PLANNED and the observation to pending.

**Exit:** Spec acceptance rows for SMS/email paths pass at the unit/integration level intended for this repo.

### 4. Plan settlement finds capture journals

- In `autoPostDue` and in `generate` for occurrences on or before today plus the strict window (never future horizon), run the matcher inside the session before posting or minting.
- Strict unique → plan attach (step 2) instead of posting. Ambiguous/soft → leave PLANNED, surface in inbox.
- User `post`: no silent attach; return the candidate so the UI can offer “link instead?”.
- Keep Planned payment auto-post semantics for the no-observation case.

**Exit:** Plan-due after capture no longer doubles the books when identity is unique, and leaves no orphan PLANNED journal.

### 5. Inbox Merge into Journal and plan UI

- Candidate picker includes plan-linked **PLANNED** and **POSTED** journals and soft-match occurrences.
- Dual-POSTED pairs (restore/import): offer collapse using existing cross-journal merge; default survivor = sole plan-linked journal.
- Plan occurrence Post: “This matches an existing transaction — link instead?” prompt.
- Planned payment auto-post setting copy per spec.
- Keep stale-modal caution (audit F-16): resolve selection by id from live list where practical.
- Avoid growing `useTransactionInboxViewModel` further without extracting link/merge actions (audit F-08); extract a small command helper if the hook would absorb the matcher.

**Exit:** Ambiguous, soft, and conflict cases are resolvable without bulk Activity multi-select as the only path.

### 6. Spec/docs cutover and capture-plan pointer

- Keep this plan’s status current as slices land.
- Capture spec already points here for cross-movement identity; update status lines when shipping.

## Sequencing vs capture audit

Do **not** block this feature on F-01 (capture policy → DB) or F-03 (queryable allocations).

While touching Gmail/SMS decision paths, prefer folding F-04 (single Gmail ingestion decision) and F-10 (manual import uses shared classify) if cheap — both reduce divergent identity decisions next to the new matcher.

## Out of scope (plan)

- Backfill of historical duplicate journals.
- Voice settler.
- FX plans as unattended settle targets.
- Silent collapse engine / cross-device write serialization solely for this race.
- New transaction-group aggregate.
- CaptureProvider / god-hook refactors beyond what inbox merge forces.

## Verification (when implementation is requested)

Do not run tests by default; follow the user’s execution preference. Behavioral cases to cover when asked:

- Unique SMS settles **PLANNED** with auto-post off; dates follow the post model.
- Unique email mints occurrence when generation has not run; cursor advances.
- Capture-would-review observation does not settle.
- Capture-first then plan attach upgrades Uncategorized once and retires the PLANNED journal.
- User-categorized capture journal: attach without rewrite.
- Liability/asset plan counter-account vs Uncategorized expense → review.
- Two plans, or two pending observations, for one window → review.
- Daily-plan window cap.
- Date +2 and fee difference → soft match blocks capture auto-post.
- Structural conflict → no auto; manual link preserves plan lines.
- Cross-channel silent attach vs same-channel second observation → review.
- Reference conflict never attaches.
- User Post with candidate → prompt, no silent attach.
- FX / SKIPPED / PAUSED / COMPLETED / future / elsewhere-consumed / capture-off refuse unattended settle.
- Undo of settle and of attach restore prior state, including the PLANNED journal.
- Dual-POSTED via restore/import merge prefers sole plan-linked survivor.
