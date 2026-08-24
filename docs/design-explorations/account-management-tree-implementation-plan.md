# Account management tree implementation plan

## Decision record

Accounts form an arbitrary-depth **forest**: every account has zero or one parent, roots are ordered per account type, and every sibling list has its own order. An account never belongs to two parents.

This replaces the current arrow-based management interaction with a flattened, virtualized tree and staged edits:

- Drag reorders an account within its sibling list.
- Pointer position resolves one explicit target at a time: before, after/outside, or child. The active target is highlighted during the drag.
- A parent moves with its full subtree.
- Changes render immediately but are not persisted until Save.
- Discard restores the exact baseline tree.

### Change-count semantics

`Save N changes` counts intentional user operations, not every account whose `orderNum` or parent link must be rewritten. A single parent drag is one change, even though it carries descendants and may normalize sibling positions.

Before the user saves, every staged subtree move states its scope inline. For example:

```text
Travel  · pending
Moves Travel and 2 child accounts
```

The Save bar can therefore remain unambiguous:

```text
Save 1 change
```

If multiple operations are staged, the summary uses the same language, such as `Save 3 changes`, while each affected subtree retains its own preview copy. Do not replace this with `Save 7 accounts`, which mixes the user’s actions with persistence side effects.

The existing persistence model already supports arbitrary depth through `parentAccountId` and sibling-scoped `orderNum`. No database migration is required.

## Example interaction

Starting tree:

```text
Cashback
Travel
  Trip exchange
Trip extras
```

Dragging `Trip extras` over the body of `Travel` selects the child target:

```text
Travel
  Trip extras  · drag preview
```

Dropping there stages this result. Moving to the trailing edge of Travel's last visible child instead selects the outside target.

```text
Cashback
Travel
  Trip exchange
  Trip extras  · pending
```

Dragging `Travel` moves `Travel`, `Trip exchange`, and `Trip extras` as one block. Dropping that block into either of its own descendants is never a valid target.

## Product rules

Every target is derived from the projected draft tree and must obey these rules:

1. Only leaves receive transactions.
2. An account with direct transactions cannot receive a child.
3. Parent and child share an account type.
4. Archived accounts cannot receive new children.
5. A move cannot create a cycle.

At rest, an account that could receive children remains visually ordinary. Actual parents show only a disclosure affordance, child count, indentation, and connector. Eligibility appears during drag, where it matters.

## New primitives

### Tree snapshot

Keep the existing account-tree snapshot as the structural source of truth. It already exposes parent links, descendants, sibling lists, and structural validation.

Extend it only where necessary to expose the complete placement state needed by draft save validation.

### Flattened tree projection

Add a pure utility that iteratively projects the tree into the minimal row shape the renderer needs:

- account identity
- depth
- actual child count and expanded state

Pending state stays in the draft/view-model layer. The renderer consumes the projection list and does not recursively render children.

### Tree draft

Add a reducer-backed draft with a baseline snapshot and an ordered list of intentional operations. It should:

- apply a reorder, outside drop, or child drop to the projected tree
- expose the current projection immediately
- identify whether the draft differs from its baseline
- count user operations for `Save N changes`
- attach affected-subtree count and copy to each staged parent move
- discard back to baseline
- retain enough baseline information to reject a stale save safely

Do not persist the draft to account records. It stays in the management screen state through ordinary backgrounding. A full process restart does not restore it in the first version.

### Drag target resolver

Given the flattened draft tree, dragged root row, and pointer location, return exactly one of:

- sibling insertion before or after a row
- outside slot below an eligible parent
- child slot inside an eligible parent
- no target

The resolver works on a whole subtree. It excludes the dragged row and every descendant from possible targets before validating type, archive, transaction, and cycle rules.

### Drag controller

Use Gesture Handler and Reanimated, already installed in the app, to coordinate:

- handle-only drag activation in Organize state
- live row displacement
- live valid-target highlighting
- subtree placeholder/preview
- edge autoscroll in a long list
- haptics on entering a valid target and completing a drop

Run a focused compatibility spike before choosing whether this controller can use a third-party sortable-list component. The spike must demonstrate variable row heights, arbitrary depth, autoscroll, nested targets, and coexistence with ordinary list scroll on iOS and Android.

### Atomic draft save

Add one account-tree command that accepts the final staged placement result rather than calling the current single-destination move command repeatedly. Inside one tree transaction it must:

1. Reload current accounts.
2. Reject a stale baseline if affected sibling lists no longer match.
3. Validate the complete final forest.
4. Normalize every touched sibling list.
5. Persist all placement changes and audit records atomically.

No partial tree write is acceptable. A failed Save leaves the draft in place and shows the reason.

## Screen and component changes

### Management view model

Replace the current short-lived pending patch and immediate `moveAccount` call with the draft owner. It provides:

- flattened projected rows
- expansion state
- organize state
- drag lifecycle callbacks
- staged operation count and pending row data
- Save, Discard, and exit-guard callbacks
- save/error state

### Hierarchy list

Replace the recursive `ScrollView` hierarchy renderer with a virtualized flattened list. Normal browsing has no directional control field.

In Organize state, rows receive a dedicated drag handle. Parent rows can still be expanded and collapsed by tapping the row. The current temporary treatment that makes every parentable account look like a parent must be removed.

### Rows and drag targets

Keep the row contract focused on:

- ordinary account row
- actual parent row with disclosure and child count
- tree connector/indent guide
- drag preview for a leaf or whole subtree
- current valid-target highlighting
- pending-change treatment

Child and outside intent come from distinct pointer zones and the live tree displacement. Do not render pressable controls while a pan gesture owns the pointer.

When a parent move is staged, its row also shows concise subtree copy before the Save bar, for example `Moves Travel and 2 child accounts`.

### Save and navigation guards

Show a fixed Save / Discard bar only when the draft is non-empty. Leaving intentionally with pending edits shows:

```text
Discard changes?
Your 3 staged changes have not been saved.

[ Discard changes ] [ Keep editing ]
```

App backgrounding does not prompt or discard. The screen resumes with the same in-memory draft.

## Delivery sequence

1. Add flattened projection, subtree-boundary, and target-resolution utilities with unit coverage.
2. Add the tree-draft reducer and pure operation tests.
3. Add final-tree validation and an atomic draft-save command with integration tests.
4. Spike the drag primitive on a flat test list and record the iOS/Android decision.
5. Replace the recursive management renderer with a read-only virtualized flattened tree.
6. Add Organize state and sibling reordering with live pending treatment.
7. Add nested/outside target zones, subtree preview, and autoscroll.
8. Connect draft Save, Discard, and intentional-exit protection.
9. Remove legacy arrow controls, the old immediate-move flow, and temporary parentable styling.
10. Complete device, accessibility, and regression testing.

Each step remains independently shippable behind the account-management surface. Do not combine the renderer rewrite with persistence changes in one commit.

## Test matrix

### Pure tree and draft tests

- root, nested, and five-plus-level trees
- flattened row order, depth, expansion, and child counts
- subtree boundary calculation
- sibling reorder at root and nested levels
- outside and child drops
- parent subtree moves preserve descendants and descendant ordering
- a parent move produces one staged-operation count and the correct affected-subtree preview
- self/descendant, archived, wrong-type, and direct-transaction targets are absent
- multiple staged operations compose correctly
- Discard restores the baseline exactly

### Persistence integration tests

- Save updates all touched sibling lists in one transaction
- final-tree validation catches a loop formed across multiple staged operations
- audit records match persisted placements
- an invalid or stale draft produces no partial writes

### Device tests

- handle drag on iOS and Android
- normal scrolling and edge autoscroll
- target-zone selection at several depths
- moving a parent subtree
- Save, Discard, exit prompt, and background/resume behavior
- screen-reader labels for handle, parent disclosure, targets, and pending state

## Explicitly out of scope

- More than one parent per account
- Dragging across account types
- Automatic nesting from an ambiguous drop position
- Restoring drafts after a full process restart
- Changing the existing account schema
