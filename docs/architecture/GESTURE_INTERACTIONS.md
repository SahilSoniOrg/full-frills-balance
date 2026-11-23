# Gesture interactions

## Rules

- Recognize before changing durable state. `onBegin` only means receiving touches; `onStart` means an activated pan; successful `onEnd` means an action may commit.
- A failed recognizer does not own an interaction. An activated recognizer releases its own ownership on completion, cancellation, disablement, and unmount.
- Cancellation restores the prior state. Successful chart selection stays visible until an outside touch; successful row removal happens once.
- Keep recognizers on their interactive surfaces. Vertical page scrolling must have a path to win before a child pan activates.
- Preserve compact swipe-removal rows and their written hints. Provide screen-reader actions without taking row space; use ordinary controls where they fit the surface. Motion preferences simplify animation without removing navigation or editing functionality.
- Native recognizer competition needs device checks. Callback tests verify state transitions, not platform arbitration.

## Shared controls

### Charts

`useChartInteraction` owns recognition, selection deduplication, cancellation rollback, haptics, outside dismissal, and cleanup. Callers provide hit testing and a selection callback, and attach the returned `chartRef` and `gesture` to their chart surface.

Two activation policies exist because both are in use:

- `horizontal` (default): line/area charts activate beyond ±5 points horizontally and fail beyond ±12 vertically before activation.
- `hold`: bars and heatmaps activate after 150 ms, so a normal scroll can win and an intentional held scrub can move in both axes.

Tap selection commits only on successful recognition, with an 8-point movement limit. Pan/tap recognition is exclusive. An activated pan snapshots its previous selection and restores it on cancellation; failed recognition never creates a selection.

`ChartInteractionProvider` tracks a set of per-chart ownership tokens. One chart ending cannot unlock another active chart. Its root responder capture returns `false` and does not claim navigation gestures.

Outside dismissal measures the current chart bounds when needed. Layout-time absolute coordinates become stale after scrolling. Delayed measurements are discarded after a newer selection, a newer outside touch, or unmount.

Bar-chart scrolling calls `resetInteraction()` so selection in the hook and the rendered tooltip stay synchronized. SVG shapes do not introduce an independent press-selection path.

### Row removal

`SwipeToRemove` claims leftward movement beyond 20 points, fails vertical movement beyond 16 points before activation, and requires successful completion to remove. A leftward distance beyond 72 points or velocity beyond 900 points/second qualifies. Rightward movement is available to a parent recognizer.

Swipe removal uses a guarded collapse/removal path. Finalization restores an uncommitted row. Rows retain their full content width, with written swipe hints and a reveal shown only during the gesture. Callers still decide whether removal is allowed; onboarding and allocation editors retain their existing row-level screen-reader delete actions, and allocation editors retain last-row protection. No permanent trash button is added.

### Selection and hierarchy

Account cards, section headers, journal cards, and planned-payment history use `LIST_SELECTION_LONG_PRESS_MS` (350 ms). The dedicated hierarchy handle retains its shorter 180 ms activation delay.

Hierarchy up/down buttons resolve complete sibling placements from the account-tree snapshot and feed them into the existing `onDrop` draft path. They preserve parent/type boundaries and subtrees, disable impossible moves, and remain staged until Save. A handle tap opens the grouping dialog; the main row retains its expand/select behavior.

Cancelled active hierarchy drags cannot call the successful finish path. Failure before activation cannot cancel another row's drag. Motion preferences also apply to controller lift/settle behavior; unmount cancels outstanding animations and auto-scroll.

### Scroll selectors

ClockWheel uses `useScrollSettlement`:

- Drag begin starts a user-owned scroll session.
- Momentum begin suppresses the fallback; momentum end commits once.
- A release without momentum commits after 120 ms of scroll inactivity. Late snap/scroll events restart that timer so the final offset wins.
- Programmatic scrolling has no user session and cannot commit a selection.
- Explicit tapping/accessibility adjustment cancels a pending scroll commit. Unmount clears pending timers.

## Primary page navigation

Home has one six-leaf native pager: Dashboard, Accounts, Categories, Budgets, Planned Payments, Transactions. The header and bottom bar remain stationary and blend with native page progress. Accounts/Categories and Budgets/Planned Payments use static subtabs inside their page panes; there are no nested horizontal pagers or boundary handoff strips. Paired header titles also offer an explicit menu. Web retains explicit navigation controls without emulating native swipes.

Paging permission accounts for navigator focus, app activity, keyboard, lock, screen reader, workplace switching, selection mode, drawer visibility and screen-owned overlay locks. Losing permission restores the committed page without animation. Reduce Motion skips automatic page travel while direct finger-driven navigation remains available.

On native, a right swipe can open the closed drawer from anywhere on Dashboard. The pager publishes its current gesture permission to the shell, so focus, app state, keyboard, lock, screen reader, Workplace switching, selection, and child swipe reservations block both opening and paging. An open drawer can still be swiped closed while paging is disabled, subject to its own interaction gates. The avatar trigger remains an explicit opening control. Web uses explicit controls and does not enable drawer or page swipe gestures. Chart and row interactions reserve paging through `setPageSwipeLock`.

Expo Router owns the committed leaf, deep links, and Back. Add follows the committed leaf. Group taps restore their last selected leaf. Settings and details open over the originating leaf. Legacy Accounts and Plans tab queries normalize to leaf routes on focus. The native shared value owns continuous progress while React handles committed selection and queued navigation intent.

Visited scenes retain UI state. Idle neighbor preparation uses Expo Router PRELOAD before mounting a route, preserves existing route identity and params, and pauses during gestures, backgrounding, lock, or Workplace transitions. Distant retained scenes pause costly reads. A short swipe can still reach a cold query.

See the [Workplace contract](../specs/user-device-workplace/spec.md) for switching and creation-draft isolation.

### Device acceptance

- Swipe across every leaf boundary, cancel and reverse, and try rapid group taps and distant jumps. Check route, header, scroll, search, and selection state.
- Check drawer/pager/chart arbitration on iOS and Android. Cover keyboard, overlays, Reduce Motion, large text, RTL, screen readers, and Android Back.
- Lock, background, or switch Workplaces during interaction. Check that no data from the previous Workplace appears and that a bound creation draft cannot save into the new Workplace.
- For a performance claim, compare release builds on the same device and dataset. Check native frame time and cold destination readiness independently.
