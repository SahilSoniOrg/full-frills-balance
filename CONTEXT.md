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
The Activity tab’s journal feed: date-scoped transactions with Selection mode, period bar, and share. One presentation module over the shared journal transaction pipeline.
_Avoid_: Journal list screen helper / reshape adapter as a separate concept; search-global on the Activity tab (search is its own screen)

### Insights

**Insight**:
A detected financial pattern surfaced in Hub (e.g. recurring charge, spending spike, missing emergency fund). Carries severity, short message, explanatory description, suggestion, and optional linked journals.
_Avoid_: Notification, alert, tip (for this Hub concept)

**Insight amount**:
The monetary impact of an Insight when it has one. A distinct field from description — never embedded as formatted text inside description prose.
_Avoid_: formattedAmount inside description strings

**Insight description**:
Human-readable reason prose for why an Insight appeared. Contains no monetary figures.
_Avoid_: Preformatted money in copy
