# FUL-28: Multi-selection UX research

**Scope.** Primary-source review of official iOS guidance, Material guidance, and first-party help for productivity apps. The sources do not prescribe one universal pattern for every list; recommendations below are the strongest, directly applicable patterns for a transaction/productivity-style list.

## Findings

### 1. Entry gesture

- **Use long-press on a row as the discoverable mobile entry gesture, then use taps to add/remove rows.** Google Keep’s first-party iPhone/iPad help explicitly says to “touch and hold a note” and then tap other notes to select them. Microsoft To Do documents the same long-press-then-tap pattern on Android. [Google Keep, “Organize your notes — iPhone & iPad”](https://support.google.com/keep/answer/6191044?hl=en&co=GENIE.Platform%3DiOS) · [Microsoft To Do, “Move tasks between or within lists”](https://support.microsoft.com/en-us/todo/move-tasks-between-or-within-lists)
- **Keep normal tap semantics separate from multi-select.** Material 3 says a list has one selection mode at a time; a single-action list can change to a multi-select list, but should not be both simultaneously. For FUL-28, a normal tap should continue to open/inspect a transaction; long-press should enter selection mode. [Material 3, “Lists — Specs”](https://m3.material.io/components/lists/specs)
- **Support an explicit alternate entry point where useful.** Microsoft To Do’s iOS flow enters selection through **List options → Edit**, while Android uses long-press. This supports offering a visible “Select” affordance in an overflow/list-options menu without making long-press the only path. [Microsoft To Do](https://support.microsoft.com/en-us/todo/move-tasks-between-or-within-lists)

### 2. Action placement

- **Promote actions into a contextual selection toolbar, not each row.** Material 3 describes list items as potentially containing selection, icon buttons, and overflow actions, but its selection-spec guidance requires a single selection mode. Once selection mode begins, replace/transform the top app bar into a contextual bar showing the selected count and only actions valid for the current selection. [Material 3, “Lists — Guidelines”](https://m3.material.io/components/lists/guidelines) · [Material 3, “Lists — Specs”](https://m3.material.io/components/lists/specs)
- **Place high-frequency bulk actions where the thumb can reach them; keep destructive actions clearly labeled and separated.** First-party examples put bulk operations in a contextual action area: Google Keep exposes “Change color” after multi-select; Microsoft To Do exposes “Move” from the top-right list options on iOS and Android. [Google Keep](https://support.google.com/keep/answer/6191044?hl=en&co=GENIE.Platform%3DiOS) · [Microsoft To Do](https://support.microsoft.com/en-us/todo/move-tasks-between-or-within-lists)
- **Use a visible cancel/exit control and make selection state persistent while scrolling.** This is a direct implementation implication of the contextual-mode patterns above: users must be able to leave selection without accidentally applying an action or opening a row.

### 3. Select-all scope

- **Scope “Select all” to the current list/view, not the entire account.** Microsoft To Do documents “Select all” in the Android list’s three-dot menu, alongside actions on the selected tasks; its iOS flow begins from a specific list’s options. This supports a local scope such as the currently visible account/list/filter. [Microsoft To Do](https://support.microsoft.com/en-us/todo/move-tasks-between-or-within-lists)
- **Make the scope explicit in the UI when filters, tabs, or date sections are present.** Recommended labels: “Select all transactions in this view” or “Select all 42.” If the view is filtered, do not silently select hidden/off-filter rows; offer a separately labeled broader action only if the product needs it.
- **Represent partial selection with an indeterminate state.** Material 3’s checkbox guidance identifies checkboxes as the control for selecting multiple related list items. Use a tri-state header control (none / some / all in current scope) and keep it visually distinct from row selection. [Material 3, “Checkbox — Guidelines”](https://m3.material.io/components/checkbox/guidelines)

### 4. Range selection

- **Treat range selection as a secondary, power-user interaction—not the only selection mechanism.** Apple’s UIKit documentation states that on iOS, with multiple selection enabled, users select additional rows by tapping them; Command/Shift-click range-style behavior is documented for macOS, not iOS. Therefore, do not require desktop-style Shift selection on touch devices. [Apple, `UITableView.allowsMultipleSelection`](https://developer.apple.com/documentation/uikit/uitableview/allowsmultipleselection)
- **For a chronological transaction list, add a touch-friendly range affordance only if the use case warrants it.** A practical option is: enter selection mode, select one row, then provide “Select through here” on a subsequent long-press/context action; alternatively support a two-finger drag only after usability validation. The baseline should remain independent row taps plus Select all.
- **On iPad with keyboard/mouse, support platform-standard modifier selection where the framework provides it.** Do not expose that desktop behavior as the primary phone interaction. Apple’s documentation distinguishes iOS tap behavior from macOS Command/Shift-click behavior. [Apple, `UITableView.allowsMultipleSelection`](https://developer.apple.com/documentation/uikit/uitableview/allowsmultipleselection)

## Recommended FUL-28 baseline

1. Normal tap opens a transaction; long-press enters multi-select mode.
2. Contextual top bar shows selected count, Cancel, Select all (current view), and bulk actions such as Categorize, Move, and Delete.
3. Row taps toggle selection; checkboxes/selection indicators appear only in selection mode.
4. “Select all” is limited to the current list/filter and states its count/scope.
5. Start without range selection on phone; consider a clearly labeled range action and native modifier support on iPad/desktop after the core flow is validated.

## Sources

- [Apple Human Interface Guidelines — Selection and input](https://developer.apple.com/design/human-interface-guidelines/selection-and-input)
- [Apple Developer Documentation — `UITableView.allowsMultipleSelection`](https://developer.apple.com/documentation/uikit/uitableview/allowsmultipleselection)
- [Material 3 — Lists, Guidelines](https://m3.material.io/components/lists/guidelines)
- [Material 3 — Lists, Specs](https://m3.material.io/components/lists/specs)
- [Material 3 — Checkbox, Guidelines](https://m3.material.io/components/checkbox/guidelines)
- [Google Keep Help — Organize your notes (iPhone & iPad)](https://support.google.com/keep/answer/6191044?hl=en&co=GENIE.Platform%3DiOS)
- [Microsoft Support — Move tasks between or within lists](https://support.microsoft.com/en-us/todo/move-tasks-between-or-within-lists)
