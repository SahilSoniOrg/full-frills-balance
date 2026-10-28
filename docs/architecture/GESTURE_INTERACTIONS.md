# Gesture interactions

Updated 29 October 2026.

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

ClockWheel and GlyphCarousel share `useScrollSettlement`:

- Drag begin starts a user-owned scroll session.
- Momentum begin suppresses the fallback; momentum end commits once.
- A release without momentum commits after 120 ms of scroll inactivity. Late snap/scroll events restart that timer so the final offset wins.
- Programmatic scrolling has no user session and cannot commit a selection.
- Explicit tapping/accessibility adjustment cancels a pending scroll commit. Unmount clears pending timers.

## Primary page navigation

The native primary pager has six committed routes in order: Dashboard (`index`), Accounts (`accounts`), Categories (`categories`), Budgets (`commitments`), Planned Payments (`planned-payments`), and Activity (`activity`). The stationary bottom bar exposes four groups: Dashboard, Accounts (Accounts/Categories), Plans (Budgets/Planned Payments), and Activity. Group taps select the last committed route in that group; subtab controls select the sibling route. Web uses those same routes and controls without touch paging.

The pager owns horizontal movement outside the screen content. A preview is not the selected route: feature actions and focus-controlled reads follow the committed route, and only a selected/settled native page changes the router state. Legacy `accounts?tab=categories` and `commitments?tab=planned` links are replaced with their canonical leaf routes before screen content mounts.

On Dashboard, a rightward body drag belongs to the full-width drawer gesture and a leftward drag belongs to the pager. On other primary pages the drawer opens from its leading edge; body swipes remain available to the pager. An open drawer disables pager movement and owns its close drag. Both recognizers use directional activation, with the drawer configured to block the page recognizer when it owns the boundary drag.

Chart pans and swipe-to-remove rows establish an explicit native relationship that lets the child gesture block the pager. Vertical scroll, taps, long presses, selection mode, keyboard presence, app/workplace interruption, screen-reader use, and screen-owned blocking overlays retain their existing owners. Do not decide ownership from JavaScript callbacks after movement begins, and do not use a global responder capture.

Native recognizer configuration is source-integrated but has not been demonstrated on Android or iOS for this pager. Reduced-motion behavior, VoiceOver/TalkBack focus, interruption/cancellation, and release performance also remain device acceptance work. The implementation does not claim those gates passed.

## Prior verification for the October 7 gesture fixes

- Full Jest run: **496 suites, 3,325 tests passed**, including cancellation, ownership, delayed measurement, disabled/empty charts, slow picker releases, hierarchy draft moves and reduced motion.
- Type checking, architecture checks, privacy-policy version check, and whitespace checks passed. Lint has no errors; an existing dependency warning remains in `useJournalSuggestions`.
- Live iOS: vertical chart scrolling produces no selection; tap selection works; outside dismissal works after scrolling; horizontal chart dragging works both ways. Ordering buttons stage a move, and Discard restores it. The initially added split removal buttons were tested, then removed at the user's request to retain the compact gesture-and-written-hint layout. Cancellation, successful removal, and screen-reader delete actions remain covered by regression tests.
- Inspection changes were discarded; no journal was saved and no hierarchy move was committed. The app was returned to Dashboard with its original Simple entry mode.
- Android device arbitration, VoiceOver/TalkBack interaction, interrupted native swipes, and switching system/app motion preferences were not exercised on-device. Callback/configuration regression tests cover the corresponding implementation paths.

## Primary pager verification status (29 October 2026)

- `bun run typecheck` passed for the source changes.
- Automated tests and native builds were not run for the pager change.
- Android/iOS gesture arbitration, cancellation, accessibility, and matched release-performance acceptance remain unverified on device.
