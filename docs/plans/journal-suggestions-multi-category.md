# Journal suggestions: multiple target categories

## Goal

When the same journal description has been used with more than one target account,
the description picker must show each valid description/category pairing and let the
user select the intended pairing.

Example:

```text
Milk       Food
Milk       Groceries
```

Existing description matching and casing behavior stays unchanged. The dropdown may
show more than 10 rows because it is already scrollable.

## Current failure

The journal suggestion query returns one row per description/account pair, then
`computeDominantTargetAccount` collapses those rows to one target account. The service
caches that collapsed result by workplace only. The active simple-entry tab is applied
later by the UI, so an income entry can receive an expense target or no visible target
at all.

## Implementation

1. Extend the suggestion read model with all target-account candidates, including
   usage count and latest usage date.
2. Remove the single dominant-account collapse from the suggestion path. Keep all
   valid candidates, ordered by recent usage and then frequency.
3. Preserve the existing case behavior. Do not normalize stored or displayed
   descriptions.
4. Filter candidates by the active tab before rendering or selection:
   - expense: expense categories;
   - income: income categories;
   - transfer: asset and liability accounts.
5. Render one selectable row per description/category pairing. Selecting a row sets
   both the description and that row's target account.
6. Increase the display limit to a configurable scrollable-list limit.
7. Keep cache invalidation correct after journal writes and avoid reusing a result that
   was calculated for the wrong tab.

## Regression coverage

- One description returns two categories.
- Expense and income entries show only compatible target categories.
- Selecting one pairing applies that exact target account.
- Switching tabs does not reuse an incompatible target.
- Existing case behavior remains unchanged.
- The increased list limit is respected.
- Existing workplace isolation and malformed-link behavior remain intact.

## Verification

Run the focused journal suggestion tests, then typecheck the application. Manually
verify the simple entry flow with one description historically posted to two expense
categories and one income description.

## Current implementation status

Implemented in:

- `src/data/repositories/journal/JournalEnrichmentQueries.ts`
- `src/features/journal/hooks/useJournalSuggestions.ts`
- `src/features/journal/entry/hooks/useJournalEntryShell.ts`

The query now emits one suggestion per description/account pairing, ordered by the
account's latest usage and then frequency. The hook filters those pairings by the
active simple-entry tab and shows up to 20 rows. Existing selection code already
applies the selected row's target account.

Verified with:

```text
3 focused suites passed, 28 tests passed
npx tsc --noEmit passed
git diff --check passed
```
