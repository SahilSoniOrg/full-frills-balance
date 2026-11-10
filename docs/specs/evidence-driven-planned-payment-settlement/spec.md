# Evidence-driven Planned Payment settlement

**Date:** 2026-11-10 (revised after design review the same day)
**Status:** Implemented on `t3/evidence-driven-settlement`; pending merge/rollout.
**Related:** [Glossary](../../../CONTEXT.md), [ADR 0010](../../adr/0010-evidence-driven-planned-payment-settlement.md), [Automatic transaction capture](../automatic-transaction-capture/spec.md), [Implementation plan](../../plans/evidence-driven-planned-payment-settlement-plan.md)

## Document responsibilities

| Document | Authority |
| --- | --- |
| Glossary | Meaning of Source observation, Planned Payment, Planned payment auto-post, Evidence-driven settlement, Uncategorized account |
| ADR 0010 | Why evidence-driven settlement may post without Planned payment auto-post |
| Capture spec | Capture posting gate, observation provenance, categorization review |
| This spec | Product behavior when capture observations and Planned Payments describe one money movement |

## Purpose

A single journal represents one money movement. Source observations (SMS or email) and a Planned Payment may all describe that movement. They attach as two link kinds — observation↔journal and journal↔Planned Payment — instead of creating separate journals that the User must merge later.

## Domain boundary

- **Source observation link:** inbox `linked_journal_id` plus capture provenance sources on the journal. Channels remain SMS, email, and voice (voice stays draft-only and is not a settler).
- **Planned Payment link:** `journals.planned_payment_id`. This is not a Source observation.
- **Planned payment auto-post:** posts due occurrence journals on the schedule with no observation evidence.
- **Evidence-driven settlement:** a uniquely matching SMS or email may create or post the occurrence journal using the Planned Payment's accounts, even when Planned payment auto-post is off.
- **Posting gate:** unattended evidence-driven settlement runs only when Automatic transaction capture would itself have auto-posted this observation (`decideCapture` returns post: capture permission, account eligibility, currency checks). Capture being enabled is not enough, and Device SMS listen alone is never permission to settle.
- No historical backfill of existing duplicate journals. Forward-only.

Avoid calling these attachments “tags.” Prefer link, observation, and Planned Payment link.

## Occurrence model (current code)

Planned occurrence journals are generated ahead of time as **PLANNED** journals up to the recurring horizon, and the Planned Payment's `nextOccurrence` cursor advances at generation, not at posting. Consequences this spec relies on:

- The common case is an observation meeting an existing **PLANNED** occurrence journal. “No occurrence journal yet” happens only when generation has not run for that date.
- Posting an existing **PLANNED** journal *claims* the occurrence; it does not advance the schedule. Only minting a journal for a date at or past the cursor advances it.
- An occurrence is claimed by a non-PLANNED plan-linked journal whose `ORIGINAL_PLANNED_DATE` (or, absent that, `journal_date`) falls on the occurrence day. Every write path in this spec that settles an occurrence must leave exactly one claiming journal and no leftover **PLANNED** journal for that day.

## Identity rules

### Hard identity (existing)

Same normalized bank reference, amount, currency, financial account, and direction (with the existing transfer opposite-observation rule) uniquely identifying a **POSTED** journal remains an automatic observation link. Do not weaken that path.

A differing bank reference is hard evidence of a *different* movement: a candidate journal whose existing sources carry a different normalized reference on the same account is excluded from every soft or plan match below.

### Candidates are occurrences

A candidate is one Planned Payment **occurrence**, not a Planned Payment. An occurrence is represented by its **PLANNED** journal, its claiming **POSTED** journal, or — only when generation has not run — the projected due date.

Eligible occurrences for unattended settlement:

1. Planned Payment is **ACTIVE** (not PAUSED or COMPLETED).
2. Occurrence is not **SKIPPED** and not already claimed.
3. Planned Payment has no currency conversion (`fxMode` unset). FX plans never settle unattended in v1; matching observations go to review.
4. Occurrence date is on or before today plus the strict window. Future horizon occurrences are never candidates.

### Strict match (unattended)

An observation and an eligible occurrence strictly match when all hold:

1. Same amount and currency. The amount is the occurrence journal's current visible-leg amount when a **PLANNED** journal exists (the User may have edited that one occurrence), otherwise the Planned Payment amount.
2. Same financial account as the observation-visible leg (for transfers, the visible leg; the Planned Payment still owns the full journal shape).
3. Compatible direction.
4. Observation date within the **strict window** of the occurrence date: **±1 local calendar day**, capped so the window never reaches half the Planned Payment's interval (a daily plan gets a same-day-only window).
5. No reference conflict (above).

Merchant/name similarity may rank or explain review candidates. It is not a hard identity key. Unequal amounts never strictly match.

### Uniqueness is two-sided

Unattended action requires uniqueness in both directions at decision time:

- The observation strictly matches exactly one eligible occurrence, **and**
- That occurrence strictly matches exactly one movement: no other pending observation in the inbox and no other unlinked, non-plan **POSTED** capture journal also strictly matches it.

If either side has more than one candidate, nothing is linked or posted unattended.

### Soft match (review only)

An observation **soft-matches** an occurrence when account, currency, and direction agree and either:

- the date falls outside the strict window but within the **soft window** (±4 local calendar days, still capped below the plan interval), or
- the amount differs but is within the **soft amount tolerance** (5% of the occurrence amount).

These values are tunable matcher constants. A soft match never links or posts. It **blocks ordinary capture auto-post** for that observation and sends it to inbox review with the occurrence offered as a Merge into Journal target. This is what stops late debits (weekends, holidays, delayed emails) and fee/tip differences from reintroducing the duplicate this feature removes.

### Structural conflict

If the observation's established economic kind or posting structure strongly disagrees with the Planned Payment's journal shape (for example expense vs own-account transfer), do **not** auto-identify. Treat it as a soft match: review, no capture auto-post. The User may still link the observation to the plan journal via inbox Merge into Journal. Linking for provenance must not rewrite the Planned Payment's posting lines.

### Ambiguity

Zero strict candidates and zero soft candidates → ordinary capture. Many strict candidates, or any soft candidate → inbox review; the User chooses via **Merge into Journal**.

## Concurrency

Matching and the resulting write run inside **one accounting write session**. `runAccountingWriteSession` serializes writers on the device, so reading candidates inside the session (or re-validating them there before writing) means capture and Planned payment auto-post cannot both mint a POSTED journal for one movement on the same device.

Dual-POSTED journals can still arrive through paths that bypass that serialization (restore, import, or a future multi-device sync). Those are User-resolved via inbox **Merge into Journal**; prefer the plan-linked journal as survivor when exactly one candidate has a Planned Payment link. No silent post-hoc collapse engine and no historical cleanup tool.

## Behavior by writer

### Observation arrives (SMS or email)

After ordinary same-source idempotency, inside one write session:

1. Unique hard reference match → link observation; do not create a second journal.
2. Else, if the posting gate passes and a two-sided-unique strict match exists:
   - **PLANNED** occurrence journal → evidence-driven settlement posts it with plan lines, links the observation.
   - Claiming **POSTED** plan-linked journal → silent-attach only if the journal has no source from the same channel as the new observation and no reference conflict (an email confirming an SMS). A second observation from the **same channel** goes to review: it may be a separate real spend of the same amount.
   - No occurrence journal (generation has not run) → mint a POSTED plan-linked journal from plan accounts with `ORIGINAL_PLANNED_DATE` = occurrence day, link the observation, advance the cursor past that occurrence.
3. Else, if any strict-but-ambiguous, soft, or structural-conflict candidate exists → inbox review (`duplicate_flagged` or equivalent); no capture auto-post. User may Merge into Journal.
4. Else → ordinary capture post-or-review (`decideCapture`).

Matchers that today only consider **POSTED** journals must also consider **PLANNED** plan-linked journals for steps 2–3.

### Planned Payment settles

Applies to unattended Planned payment auto-post (`autoPostDue`) and `generate` for occurrences dated on or before today plus the strict window. Future horizon generation does not run the matcher.

Before posting or minting, inside the same write session:

1. Two-sided-unique strict match against an unlinked, non-plan **POSTED** capture journal → **plan attach** (below). Do not post the PLANNED journal; retire it.
2. Ambiguous or soft candidates → do not attach and do not auto-post this occurrence; leave it PLANNED and surface the candidates in inbox review.
3. Else → post/create as today.

**User-initiated post** (the User taps Post on an occurrence) never silently attaches. If a strict or soft candidate exists, offer “This matches an existing transaction — link instead?” and let the User choose between linking and posting.

### Plan attach (capture journal becomes the occurrence journal)

One accounting write and one undo step that:

1. Sets `planned_payment_id` on the capture journal.
2. Writes `ORIGINAL_PLANNED_DATE` = occurrence day so the journal claims the occurrence.
3. Retires the occurrence's **PLANNED** journal (soft delete in the same session). Undo restores it.
4. Applies the Uncategorized upgrade when eligible (next section).
5. Links any pending observations that strictly and uniquely match the journal.

### Uncategorized upgrade

Rewrite a capture journal's category line to the Planned Payment's counter-account only when all hold:

- The line's allocation has `origin: 'uncategorized'` and no `confirmedAt`. Lines with `origin` of `user` or `default` (merchant rule) are real categories and are never rewritten.
- The journal has exactly one category line, and the User has not edited the journal's lines or description since capture.
- The Planned Payment's counter-account is the same kind (expense ↔ expense, income ↔ income) and currency as the Uncategorized line. If the plan's counter-account is an asset or liability (card payment, loan, savings), that is a structural conflict: attach the plan link only if the User confirms in review, and never rewrite lines.

When the rewrite runs, the allocation's categorization review is resolved (do not leave a fake Uncategorized review open). The description is replaced with the Planned Payment name only if it is still the capture-generated description. A plan-driven category is **not** fed into merchant→category defaults.

When the rewrite is not eligible, plan attach still sets the link and claims the occurrence; existing lines and review state are untouched.

### Manual-FX and other FX Planned Payments

FX Planned Payments never settle unattended in v1. Matching observations go to review; posting still requires FX review for manual-FX plans.

### Elsewhere-consumed observations

Same as capture: no unattended settle across Workplaces. Explicit manual consume remains allowed.

## Journal shape, dates, and audit

- The Planned Payment owns the journal's accounts when settlement is plan-driven or when Uncategorized lines are upgraded by plan attach.
- **Dates follow the existing post model:** `journal_date` is the observation date (when money actually moved); `ORIGINAL_PLANNED_DATE` records the occurrence day and is what claims the occurrence. This matches how `stagePost` already handles a User post.
- Preserve the Planned Payment description on plan-created journals; merchant remains capture provenance.
- An additional observation does not reopen completed categorization review.
- Evidence-driven posts and plan attaches are audited as system actions with a distinct evidence-driven source (not `MANUAL_POST`), carrying the observation id.
- **Undo of evidence-driven settlement** returns the journal to PLANNED with its original date and plan lines, unlinks the observation, and returns the observation to pending inbox review. **Undo of plan attach** removes the link, restores the original lines/description/review state, and restores the retired PLANNED journal.

## Inbox User resolution

Extend the existing inbox duplicate / **Merge into Journal** flow so the User can:

- Link an observation to a plan-linked **PLANNED** or **POSTED** journal.
- Resolve soft-match, structural-conflict, and same-channel second-observation cases without inventing a second books store.
- Collapse a dual-POSTED pair into one journal per the survivor rule above.

Primary surface is the inbox review flow already used for duplicates. Do not require a separate plan-detail linker for v1.

## Settings copy

The Planned payment auto-post setting states that matching SMS or email can still record the payment when Automatic transaction capture is on, so turning auto-post off does not read as “never post without me.”

## Out of scope

- Historical backfill of existing triples.
- Voice as evidence-driven settler.
- FX Planned Payments as unattended settle targets.
- 1:N partials (one plan, several unequal SMS) auto-settle.
- Silent fuzzy merge without uniqueness.
- A new top-level “transaction group” entity (the journal is the group).
- Relocating capture policy out of MMKV (audit F-01) unless required by this work.
- Projecting capture allocations into new tables (audit F-03) unless query cost blocks the matcher.

## Acceptance scenarios

| Scenario | Expected |
| --- | --- |
| Unique SMS, ACTIVE plan, auto-post off, **PLANNED** journal exists | Post that journal from plan lines; `journal_date` = SMS date, `ORIGINAL_PLANNED_DATE` = occurrence day; link SMS |
| Unique email, generation has not run for the date, capture on | Mint POSTED plan-linked journal; link email; cursor advances |
| Capture would review (not auto-post) the SMS | No evidence-driven settle; review offers the occurrence |
| Capture Uncategorized posted first; unique due plan later | Plan attach; Uncategorized → plan category; PLANNED journal retired; no second journal |
| Capture journal user-categorized; unique plan later | Plan attach; lines untouched; PLANNED journal retired |
| Plan counter-account is a liability; capture line is Uncategorized expense | No unattended attach; review |
| Two ACTIVE plans, same amount/account/day | Review; User merges |
| Two pending same-amount SMS within window of one occurrence | Review; nothing settles |
| Daily plan, SMS matches | Same-day window only; settles that day's occurrence |
| SMS two days late (weekend debit) | Soft match: no capture auto-post; review offers the occurrence |
| Amount differs by fee | Soft match: no auto-match, no capture auto-post; review |
| SMS structure is transfer, plan is expense | No auto-identity; review; User may link; plan lines unchanged |
| Email after SMS settled, amount/account/direction agree | Silent attach |
| Second SMS after SMS settled, same amount, next day | Review (possible separate spend); not silently attached |
| Second observation with a different bank reference | Never attached to that journal |
| Second email disagrees on amount or account | Review; still Merge into Journal |
| User taps Post on an occurrence with a matching capture journal | Prompt: link instead or post |
| FX plan (manual or automatic) + matching SMS | No unattended settle; review |
| SKIPPED occurrence + matching SMS | No evidence-driven settle |
| PAUSED or COMPLETED plan | No evidence-driven settle |
| Future horizon occurrence | Never a candidate |
| Capture disabled | No unattended settle; manual paths unchanged |
| Elsewhere-consumed SMS | No unattended settle |
| Undo evidence-driven settle | Journal back to PLANNED at occurrence date; SMS pending in inbox |
| Undo plan attach | Link removed; Uncategorized lines restored; PLANNED journal restored |
| Dual POSTED via restore/import | Inbox merge; prefer sole plan-linked survivor |
