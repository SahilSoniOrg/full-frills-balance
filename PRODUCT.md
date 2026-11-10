# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

The capture experience must work on iOS and Android while preserving the current web fallback.

## Users

People managing personal or household finances in a workplace of accounts, categories, and journal entries. This audience is inferred from the app's existing product language and workflows.

## Product Purpose

Help users maintain a useful record of money movements, review uncertain transaction imports, and understand future cash flow. This purpose is inferred from the existing app.

## Positioning

Transactions are represented as account-based journals. SMS capture can prepare or post supported messages, while uncertain categories remain reviewable. The user's books remain the source of truth.

## Operating Context

Each Workplace scopes its accounts and capture preferences. Android can read SMS; the web build does not offer automatic message capture. Users review uncategorized or uncertain entries in the app.

## Capabilities and Constraints

- Historical suggestions can use SMS evidence linked to existing posted journals.
- Multiple SMS observations linked to one journal describe one journal entry and must be coalesced as evidence.
- Historical evidence is not a user confirmation. Saving a category default affects future matches and does not edit old journals.
- SMS merchant labels remain separate in historical evidence. Possible variants may be linked for review; they do not create aliases or multi-name defaults. Saved defaults continue through the existing merchant matcher.
- History with conflicting categories must not produce an automatic category default.
- Existing merchant matching is based on normalized merchant text; the current system does not provide user-managed aliases or fuzzy matching.
- Automatic capture only posts when the transaction and account movement are supported. Uncertain categories need review.

## Evidence on Hand

- `src/features/settings/components/CaptureWorkspaceView.tsx` contains the current Capture & review workflow.
- `src/data/repositories/journal/JournalHistoricalCaptureQueries.ts` builds review-only suggestions from linked SMS evidence and posted journals.
- Existing virtual-device data includes SMS-linked journal history; it is test data, not product proof.

## Product Principles

- Preserve existing journal entries when proposing future rules.
- Make the evidence behind a suggestion visible.
- Keep uncertain or conflicting history under user review.
- Treat each linked journal as one financial event even when several SMS messages describe it.

## Accessibility & Inclusion

Use the app's accessible React Native components and retain readable layouts at enlarged text sizes on mobile.
