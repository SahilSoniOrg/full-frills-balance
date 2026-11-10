# Evidence-driven settlement may post a Planned Payment occurrence without Planned payment auto-post

Automatic transaction capture and Planned Payments can describe the same money movement. We keep two link kinds on one journal (Source observation links and the Planned Payment link) and allow a uniquely matching SMS or email to create or post that occurrence when capture would itself have auto-posted the observation, even if Planned payment auto-post is off. The auto-post flag only means unattended schedule posting without observation evidence. FX Planned Payments do not settle unattended in v1. Structural conflicts, near misses, and ambiguous matches stay with the User via inbox merge-into-journal; there is no historical backfill.

Identity must be unique in both directions (one occurrence for the observation, one movement for the occurrence) within a strict ±1-day window capped by the plan interval. A wider soft window does not match but blocks ordinary capture auto-post, because a missed match would otherwise recreate the duplicate this decision exists to remove. Match and write share one accounting write session, so the on-device capture-vs-auto-post race cannot produce two posted journals.

**Contract:** [spec](../specs/evidence-driven-planned-payment-settlement/spec.md) · [plan](../plans/evidence-driven-planned-payment-settlement-plan.md)

## Consequences

- Matchers must consider **PLANNED** plan-linked journals, not only **POSTED** ones, and treat occurrences (not plans) as candidates.
- Unequal amounts, FX plans, SKIPPED/PAUSED/COMPLETED/future occurrences, elsewhere-consumed observations, and observations capture would only review refuse unattended settle.
- A second same-channel observation never silently attaches to a settled occurrence; it may be a separate spend.
- Plan owns journal lines; journal date is when money moved and `ORIGINAL_PLANNED_DATE` claims the occurrence, matching the existing post model.
- Uncategorized capture lines may be upgraded when a unique plan attaches, only for unconfirmed fallback lines and a same-kind plan category; attach retires the occurrence's PLANNED journal; both are one undo step.
- Dual-POSTED journals from paths outside the write session (restore, import, future sync) are User-resolved; prefer the sole plan-linked survivor when merging.
