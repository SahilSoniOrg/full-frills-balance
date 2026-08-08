# Full Frills Balance

Personal double-entry finance app. Ledger-first; balances derive from the journal.

## Language

### Interaction

**Selection mode**:
A transient UI mode on a list or detail surface where the user multi-selects items for bulk actions (share, delete, clear). Entered by long-press; exited by back, tap-outside, or an explicit exit action. While active, nav chrome dims, FAB is muted, and back exits the mode instead of navigating.
_Avoid_: Command mode, selection chrome (as the name of the mode itself — chrome is how the mode presents)

**Selection-mode chrome**:
The coordinated presentation of Selection mode: nav (dim, back→exit, FAB mute), bulk action bar, and dismiss-to-exit affordances.
_Avoid_: applySelectionChrome (implementation helper name); command mode bar

### Journal list

**Journal list**:
The Activity tab’s journal feed: date-scoped journal entries with Selection mode, period bar, and share. One presentation module over the shared journal pipeline (`useJournalEntryList`).
_Avoid_: Journal list screen helper / reshape adapter as a separate concept; search-global on the Activity tab (search is its own screen)

**Journal entry row**:
A single row in a journal list representing one whole journal entry (`EnrichedJournal`). Identity is always `JournalId`. Shown on Activity, Dashboard, Search, and Insights.
_Avoid_: Calling it a "transaction" in list/UI code

**Journal entry card**:
Shared card UI for journal list rows (`JournalEntryCard`). Same component for Activity and account-filtered views; account perspective is a viewer lens on the mapper, not a separate card type.
_Avoid_: Separate ledger card component

**Viewer lens**:
Optional `{ accountId }` passed to the journal timeline mapper. When set, card amount/badges/chrome reflect that account’s leg on the journal. Details screen still loads the full journal.

**Journal details**:
Screen opened from any journal entry card. Loads by `journalId`; shows full journal including all split lines. Route: `/journal-details`.

**Insight detail list**:
Journal entries linked to an insight. Uses the same `useJournalEntryList` pipeline with a `journalIds` filter.

**Insight**:
A detected financial pattern surfaced in Hub (e.g. recurring charge, spending spike, missing emergency fund). Carries severity, short message, explanatory description, suggestion, and optional linked journals.
_Avoid_: Notification, alert, tip (for this Hub concept)

**Insight amount**:
The monetary impact of an Insight when it has one. A distinct field from description — never embedded as formatted text inside description prose.
_Avoid_: formattedAmount inside description strings

**Insight description**:
Human-readable reason prose for why an Insight appeared. Contains no monetary figures.
_Avoid_: Preformatted money in copy

### Accounts

**Account**:
A workplace-scoped ledger bucket (asset, liability, equity, income, or expense) that journal lines post to. May form a parent/child hierarchy; only leaf accounts receive transactions.
_Avoid_: Wallet (as the domain term for any account); category (except for income/expense account types in user-facing copy)

**Archived account**:
An account marked archived so it is hidden from default account lists and pickers. Still fully live for balances, reporting, posting, and references — archive is a visibility preference, not removal.
_Avoid_: Deleted account; inactive account; hidden account (as the canonical term)

**Archive**:
The act of marking an account archived. Distinct from delete: archive never removes history or blocks references; delete is a separate, reference-guarded soft-delete.
_Avoid_: Deactivate; hide (as the verb — use archive)

**Show archived**:
An ephemeral toggle on account list and picker surfaces. Off by default; resets each time the surface opens. When on, archived accounts appear with muted styling and an archive icon.
_Avoid_: Include inactive; show hidden

**Archive cascade**:
When archiving or unarchiving an account that has descendants, a confirmation dialog listing the account tree (parents and leaves, hierarchy indented). The user selects which nodes to include; nothing cascades without explicit selection.
_Avoid_: Archive all; cascade archive (as automatic behavior)
