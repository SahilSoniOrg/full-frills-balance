# Seed review-only suggestions from historical SMS journals

**Status:** Accepted
**Date:** 2026-11-07

## Context

The automatic transaction capture feature originally ignored ordinary historical journals because they did not have `transactionCapture` metadata. Many older journals still have an exact SMS link and parsed source facts in `JournalMetadata` or the linked Workplace inbox record. Ignoring that history leaves existing users with no category suggestions until they create new captured journals.

Those old categories are not all trustworthy confirmations. Some may have been selected during manual review, prefilled automatically, or posted without an individual category decision. Inbox processing status does not prove that a User explicitly chose the category. A journal can also have multiple SMS observations for one movement, and counting each observation as a separate category example would overweight that journal.

## Decision

Run a versioned, idempotent, Workplace-scoped backfill for posted journals linked to SMS. Store the deduplicated parsed source facts under a separate `historicalSmsEvidence` metadata key; do not manufacture `transactionCapture` confirmation state. Coalesce all SMS observations by journal so one journal contributes at most one historical category classification.

Generate a review-only historical category pattern only when every linked source agrees on merchant, amount, and currency, the source amount/currency agree with the journal, the journal has exactly one eligible financial Account and one eligible income/expense category, and both Accounts are eligible leaves in the journal currency. Splits, transfers, unresolved sources, and mixed-category groups do not create a default suggestion.

The User must explicitly approve an unambiguous historical pattern before it is saved as a prospective category default. This action never changes existing journals or enables automatic capture. `AUTO_POSTED` and other inbox statuses remain non-confirmation evidence.

Historical patterns keep distinct SMS merchant labels separate. Cosmetic variants can be shown as review-only links to their own past journals; the matcher must not merge their evidence or save a default across multiple labels automatically.

## Consequences

- Existing SMS-linked books can produce useful category suggestions immediately after backfill.
- Multiple SMS messages for a single journal preserve source provenance but count as one classification.
- Historical categories can influence future defaults only after an explicit User decision.
- Mixed or incomplete history stays visible as ambiguity and requires the normal review flow.
- Historical source evidence survives native backup/restore without carrying Account IDs that need remapping.
