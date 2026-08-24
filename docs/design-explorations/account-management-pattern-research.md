# Single-column account management: pattern research

## Conclusion

The current row of four directional arrows is the wrong abstraction. It asks people to infer a structural operation from a direction, then exposes controls that may be disabled without explaining why. Strong mobile patterns separate **browsing**, **local ordering**, and **changing parent**.

Keep this a one-column outline. The best hybrid of directions 1 and 3 is: an immediately scannable tree in normal mode; row tap opens account context; a deliberate **Organize** mode handles structural changes.

Mobbin is useful for visual reference but its screen library is not publicly inspectable without access, so this note relies on first-party product documentation rather than unsourced screenshot galleries.

## Four transferable patterns

### 1. Make moving a named destination action, not a directional puzzle

Things permits local drag/reorder but uses an explicit **Move** dialog when the destination needs to be chosen; its picker supports search and creating a destination. Use a clearly named **Move to…** action that opens a searchable eligible-parent picker. Do not ask users to decipher left/right for hierarchy changes.

Also give a child visible context in the detail sheet: `Under Yes Bank Uni`, with **Remove from parent** rather than a left arrow.

Sources: [Things — Moving to Other Lists](https://culturedcode.com/things/support/articles/9651894/), [Things — Parent property](https://culturedcode.com/things/support/articles/9596775/).

### 2. Reserve hierarchy affordances for actual hierarchy

Notion uses a toggle only when a page has nested pages. It exposes `+` at a parent to create directly under it, and gives clear target feedback while a dragged page is being nested or removed from a parent. That distinction matters here: an account that *can* contain children should not be made to look as though it already does.

Use a quiet capability cue in account details or selection state: **Can contain accounts** + **Add child**. Actual parents get `Contains 3 accounts` and tap-to-expand. During a move, highlight only eligible parent destinations.

Source: [Notion — Navigate with the sidebar](https://www.notion.com/en-gb/help/navigate-with-the-sidebar).

### 3. Put structural controls in a deliberate Organize mode

Todoist and YNAB keep the ordinary list readable. Reordering is entered through an explicit edit/manage flow; within it, drag handles become visible and the user exits with Done. YNAB’s equivalent account-domain pattern also separates groups from categories while allowing both to move in the same mode.

For this product:

- **Normal mode:** tap a row for account details; show type, hierarchy state, and concise child count only.
- **Organize mode:** replace row clutter with drag handles, selected-state feedback, and a bottom action bar: **Move to…**, **Make parent**, **Remove from parent**.
- **Done:** leave the mode and return to the clean outline.

This removes permanently disabled controls from every row, while preserving a fast workflow for frequent organizers.

Sources: [Todoist — Introduction to projects](https://www.todoist.com/help/articles/introduction-to-projects-TLTjNftLM), [YNAB — Add, remove, and customize categories](https://support.ynab.com/en_us/adding-removing-and-customizing-categories-a-guide-HJFO5j909).

### 4. Explain constraints at the decision point

YNAB constrains movement of special categories instead of presenting generic operations as universally available. Its mobile Plan flow is explicit about entering edit/reorder before a drag operation. The lesson: rule-based restrictions must be named where users encounter them.

When an account cannot become a parent, explain it in the account details/action sheet: `Can't contain accounts because it has transactions.` If it can, state the inverse plainly: `Can contain accounts.` Avoid a badge that makes every eligible leaf visually identical to a populated parent.

Source: [YNAB — Add, remove, and customize categories](https://support.ynab.com/en_us/adding-removing-and-customizing-categories-a-guide-HJFO5j909).

## Recommended direction to prototype next

**Single-column outline with focused intent**

1. Section header: account type, count, and one **Organize** button.
2. Rows: icon, name, optional `Contains N` metadata for real parents, indentation only for real children. Tap opens an account action sheet/page.
3. Account action sheet: `Parent: None` / `Under: …`; capability status; **Move to…**, **Add child**, **Remove from parent** when applicable.
4. Organize mode: drag handle plus a compact selected-row treatment. Use a bottom sheet/picker for a parent destination; never expose the four directional arrows.

This combines the scanability of Tree Lanes (direction 1) with Outline with Intent’s contextual control (direction 3), without a second column.
