# Journal Entry Flow Improvements

Status: implemented; bulk performance measurement remains pending

## Goal

Make every journal-entry entry point behave consistently, load predictably, and return to the correct originating screen.

## Workstreams

1. [x] Canonicalize journal-entry route inputs and draft initialization.
2. [x] Fix SMS/import metadata mapping so notes remain notes and descriptions remain descriptions.
3. [x] Make suggestion loading intentional, cached, debounced, and non-blocking.
4. [x] Prevent duplicate journal-entry pushes and clarify back-stack behavior for normal, planned, edit, SMS, and widget launches.
5. [x] Add regression coverage for every supported entry point, including hydration and save behavior.
6. [ ] Measure bulk-entry behavior and apply a bounded/virtualized solution only where evidence supports it.

## Acceptance criteria

- All entry points use the same typed draft contract.
- SMS/import opens with correct description, notes, date, accounts, type, and amount.
- Opening the journal-entry screen does not query suggestions.
- Typing/focusing the description causes at most one debounced, cached suggestion load.
- Rapid repeated taps do not stack duplicate journal-entry screens.
- Edit failures and missing journals reach an explicit terminal UI state.
- Tests cover blank, prefilled, planned, edit, copy, SMS, widget, advanced, and split flows.
- Typecheck, lint, unit tests, architecture checks, and applicable E2E checks pass.
- No changes are pushed remotely.

## Completed implementation

- Route metadata now carries description and notes separately.
- SMS/import descriptions use merchant or rule text; raw SMS context stays in notes.
- Suggestions load only on interaction, with 150 ms debounce, workplace caching, and in-flight coalescing.
- Identical journal-entry pushes within 750 ms are ignored; back clears the guard.
- Edit hydration distinguishes loading, loaded, missing, and error states.
- Focused journal-entry coverage now passes across 15 suites and 98 tests.

## Current findings

- `useJournalEntryShell` maps route `notes` into `initialDescription` and never supplies `initialNotes`.
- `useJournalSuggestions` schedules work on every non-empty query and also exposes a separate focus-triggered fetch.
- `AppNavigation.toJournalEntry` always calls `router.push` without duplicate-open protection.
- Edit hydration exposes only a boolean loading state and does not distinguish missing/error results.
- Bulk rows are rendered in an uncapped `ScrollView`; this remains a separate measured workstream.

## Bulk measurement note

The bulk editor currently renders every row through `rows.map(...)` inside one `ScrollView` and
keeps the complete draft in React state. No device/frame-time or memory profile is checked into
this repository, so a virtualization or row-cap change would be speculative. The next measurement
should compare 25, 100, and 500 rows on the target devices, including initial render, row add/edit,
keyboard interaction, account-picker open/close, and save validation. No bulk implementation change
is made in this workstream.

## Integration policy

Use small logical commits. Review each isolated workstream before integration. Squash-merge completed work into `main` only after the full validation pass. Do not push.
