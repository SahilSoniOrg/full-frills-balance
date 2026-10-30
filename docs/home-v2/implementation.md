# Home navigation

Home uses one layout: the former Home V2. V1, the version switch, and its saved preference have been removed. Existing `homeScreenVersion` values are discarded by the preference store, so every user receives the same layout.

## Experience

- One native pager moves through Dashboard, Accounts, Categories, Budgets, Planned Payments, and Activity.
- A fixed compact header contains the sidebar trigger, the current leaf title, and page actions. Titles and action layers blend with native swipe progress.
- The workplace name appears beneath the title only when multiple workplaces exist. Expanded search uses the available title space.
- Paired titles open an anchored menu with descriptions, selected state and a dimmed backdrop. The menu retains its last position and contents during dismissal.
- Accounts/Categories and Budgets/Planned Payments have conventional subtabs within each page pane. Their static selection belongs to that pane; the strip moves with the page rather than remaining in the header.
- The bottom bar blends destination selection with native progress, holding the same destination across sibling pages. Taps restore each group's remembered leaf. Add remains tied to the committed destination.
- The drawer opens from its visible trigger. Swiping an open drawer can close it; the closed drawer does not compete for page swipes.
- Web uses the same header, subtabs and explicit navigation controls. Native swipe gestures are not emulated on web.

## Architecture and data

Expo Router remains authoritative for canonical routes, deep links and Back behavior. Legacy query-selected Accounts/Plans links still normalize to their canonical leaf routes. Every page renders through its router descriptor, preserving route context and route-level effects. Legacy-link normalization runs only for the focused Accounts or Plans route, so preloaded routes cannot redirect navigation. Route screens render individual leaves; nested group pagers and the classic static viewport have been deleted. The obsolete commitment badge-count provider and update effects have also been removed.

Continuous movement stays in a Reanimated shared value. React state handles committed selection and the latest queued navigation intent, not each animation frame. Distant tab taps and Reduce Motion avoid automatic travel across unrelated pages. Gesture permission still accounts for focus, app activity, keyboard, lock state, screen readers, workplace switching, selection, drawer visibility and screen-owned locks.

Visited scenes retain UI state. Immediate neighbors mount after idle and are eligible for prepared reads, while distant retained scenes pause costly reads. The shared Accounts read serves both siblings, with the rolling-period report limited to the live leaf. Existing domain hooks retain their snapshots; this is not a new global financial cache. Cold queries can still outlast a quick swipe.

Screen-owned actions publish into the persistent header while preserving group privacy scopes. Workplace-bound providers remount on a committed workplace change to isolate data and UI state.

## Validation limits

This implementation changes navigation and shared chrome while retaining the existing page bodies and financial calculations. It does not imply measured native-frame or query-readiness improvements. Historical simulator measurements remain in `docs/performance/swipe-navigation-benchmark-2026-10-29.md` and do not measure this final implementation.

No test suite, simulator run, release build or new performance benchmark was run for this cleanup. The full TypeScript check and lint on the changed source files pass; these checks cover wiring, not native interaction behavior.

## Manual checks

- Swipe all boundaries in both directions, reverse/cancel gestures, and verify fixed header/bottom geometry and retained scroll positions.
- Tap every subtab, bottom destination and paired-title menu option. Try rapid taps during movement and distant jumps.
- Open/dismiss the menu using selection, outside tap, accessibility escape and Android Back. Confirm its position remains stable during dismissal.
- Exercise search, selection, privacy, hierarchy actions, date controls, drawer open/close and detail-screen return.
- Check large text, RTL, Reduce Motion, screen-reader navigation and keyboard behavior.
- Change workplaces and background/lock the app during interactions; verify that old-workplace data never flashes.
- Start with an existing saved V1 choice and confirm the single layout still loads, with no version toggle or settings-search result.
