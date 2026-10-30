# Home V2 in-app candidate

Home V2 is implemented with a persisted user switch under Settings → Appearance → Swipe navigation (Home V2). Until a user makes a choice, development builds default to V2 and production/release builds keep their existing V1 default unless the build explicitly opts into V2. This is an interaction candidate using the real page content and real local data.

## Try it

Open Settings → Appearance → Display Options → Swipe navigation (Home V2).

- On: Home V2, compact animated header and swipe navigation.
- Off: Home V1, classic page headers and tap-only bottom tabs/subtabs. Its outer scenes and Accounts/Plans sibling scenes use static retained views, with no page swipe recognizer or horizontal page transition.

Changes apply immediately and persist in user preferences across restarts and workplace changes. The current canonical route stays in the router; mode-specific page/gesture state is remounted when the mode changes. No financial data is changed. The sidebar retains its established drawer gesture in V1.

`EXPO_PUBLIC_HOME_V2` controls only the default for users who have not chosen a layout: 1 defaults to V2, 0 defaults to V1, and unset retains the development/release defaults. Once chosen in settings, the saved preference wins. Reload/rebuild only when changing a build variable, not when using the setting.

## Implemented

- One native pager with six stable leaf identities: Dashboard, Accounts, Categories, Budgets, Planned Payments, Activity.
- A single stationary safe-area-aware header row outside the pager. The sidebar icon, current leaf title and screen actions share that row. Each leaf title crossfades with native progress; paired titles open an anchored two-page menu. No separate sibling strip or greeting row remains.
- Existing screen-owned header actions publish into that shared header. Search, archive visibility, hierarchy actions, privacy and selection chrome still come from the real screens. Header privacy controls share the corresponding page group's privacy scope.
- Bottom destinations retain the remembered sibling. Navigation taps received during native movement retain the latest request, applied after settle. Add and header actions wait for settle to avoid acting on an unresolved page.
- Adjacent automatic navigation animates; distant taps and Reduce Motion jump directly. Finger motion remains owned by the native pager.
- Visited scenes retain their list state; neighboring scenes mount after idle. Unmounted scenes show an explicit loading placeholder when exposed before mounting. The selected page and immediate neighbors are eligible for live reads after idle preparation, independently of route commits and continuous animation progress. Distant retained scenes pause their reads. Preparation is suspended when the home navigator loses focus, the app backgrounds or locks, or the workplace switches. Retained snapshots come from existing domain hooks; this does not introduce a new global financial cache.
- Accounts and Categories share the prepared account-list read. Their rolling-period report effect remains limited to the selected live leaf, avoiding duplicate sibling report requests.
- V2 removes nested edge handoffs and closed-drawer edge gestures. Open the drawer with the visible avatar/menu control; an open drawer still supports swipe-to-close.
- V1 remains selectable. Web renders the same fixed header and six destinations with explicit controls; native swipe behavior is not emulated on web.

## Deliberate limits

This first candidate changes the navigation architecture and shared chrome, while retaining the existing page bodies, actions and financial calculations. It does not yet deliver six independently redesigned page bodies or a replacement domain read-model/cache layer.

Programmatic taps update canonical route identity when requested; native finger navigation publishes the selected leaf at settle. Header titles and action layers now follow the native progress value continuously instead of waiting for that route commit. Invisible action layers cannot receive input or accessibility focus; only the committed page can act once movement settles. Native cancellation reverses the visual blend with the page. Web tab navigation sets the same progress value directly.

Preparing adjacent reads trades bounded extra work for earlier destination readiness. Cold queries can still finish after a quick swipe; this change does not promise instant data or measured frame improvements.

No test suite, simulator session, release build, or performance benchmark was run. TypeScript checking reported two errors outside the changed files: a branded AccountId in ReportsV2Breakdown.test.tsx and the generated `/(tabs)/index` route type in src/utils/navigation.ts. These were left outside this change.

## Manual checks

Run the app and swipe all five boundaries in both directions, starting at the middle and edges of the content. The title/selector container and bottom rail should remain stationary. Accounts ↔ Categories and Budgets ↔ Planned Payments should crossfade the individual leaf titles without a second header row. Tap each paired title to open its page menu, select either sibling, and dismiss via outside tap and Android Back.

Then try a cancelled swipe, rapid bottom-tab taps during movement, a distant tab jump, account search and selection, privacy toggles in every group, opening/closing the drawer, detail-screen return, Android Back, keyboard dismissal, Reduce Motion, screen-reader navigation, large text and workplace changes. Verify retained scroll position and no old-workplace content. Compare against V1 with the environment switch.

Native recognizer arbitration, callback ordering, page readiness and retained memory still require device evidence. The presence of a native pager is not proof of smoothness.

## Revision after in-app feedback

The initial candidate left the old header visible through the swipe and held new reads until settle. The revised header uses UI-thread opacity layers driven by native page progress, without horizontal header travel or per-frame React updates. The former blank singleton selector space now carries the page title. Read eligibility covers the selected leaf and immediate neighbors prepared while idle, rather than starting every destination read at landing. Device feel and cancelled-swipe behavior remain manually unverified.

## Bottom navigation and workplace identity

Home V2 now passes its continuous six-page progress to the bottom bar. Icon surfaces, icon weight and label selection blend between adjacent destination groups on the UI thread. Selection stays steady within Accounts/Categories and Budgets/Planned Payments. Accessibility selection and Add actions continue to use the committed route, and cancelled swipes reverse the same blend. V1 retains route-based selection.

When more than one workplace exists, the header shows the committed workplace name as a small subtitle beneath the current page title. The subtitle truncates to one line and hides with the title during expanded search. Single-workplace users retain the compact avatar alone. The count comes from the drawer's existing live workplace-list subscription; adding or deleting a workplace updates visibility without another query. Renames and switches use the committed WorkplaceContext record.

Manual checks: stop a swipe midway at each group boundary and reverse it; verify both bottom selections blend and the Add control stays fixed. Swipe between siblings and verify their bottom destination remains selected. Compare one versus two workplaces, create/delete the second, rename and switch workplaces, and try a long name with search expanded and with large text. No automated tests or device checks were run for this revision.

## Single-row header revision

The redundant secondary row is removed. The header uses canonical leaf titles (Dashboard, Accounts, Categories, Budgets, Planned Payments, Activity), replacing the dashboard greeting and group-level titles in V2. Titles and action paints continue to follow native swipe progress. The action spacer interpolates between measured control widths, leaving the rest of the row to the title.

Paired-page titles have a chevron and an anchored two-option menu with the current page marked. The menu reserves swiping while open, releases its reservation before navigation, and dismisses on route/workplace/focus/layout changes, outside tap, accessibility escape or Android Back. Activity date controls stay with the content. The workplace subtitle is shown only when multiple workplaces exist; the avatar remains the drawer button.

Manual checks still required: title/menu discoverability, long titles and workplace names, large text, search expansion, menu selection/dismissal, header action sizing and cancelled swipes. No tests or simulator runs were performed.

## Menu emphasis and swipe discovery

The paired-page menu now dims the app with the theme overlay, uses an elevated surface, and presents icons, descriptive subtitles and a highlighted current-page row. A short footer explains that the same pages can be reached by swiping. Large menus are bounded to the space below their anchor and remain scrollable.

Paired header titles keep a small two-position indicator whose emphasis follows native progress. On native, each paired content page also shows a compact footer naming the other page (for example, “Swipe for Categories”). That footer stops showing for the group after a completed finger swipe between its siblings. Cancelled swipes, cross-group swipes and menu selections do not mark the gesture as learned. Discovery state is session-local to the mounted workplace shell; there is no new persistent preference or query. The content hint reserves its own space rather than covering list rows. Web retains the explicit menu and header indicator, without advertising an unsupported swipe gesture.

Manual checks: open the menu in light and dark themes, choose and dismiss it, try large text and a short landscape viewport; enter each paired page without swiping, then cancel and complete sibling swipes and check the cue and indicator. No tests or device captures were run; TypeScript continues to report only the same two unrelated errors.

## Persistent sibling button in page content

The low-visibility first-use footer hint and its discovery state are removed. Each paired pane now starts with a prominent, persistent “View Categories”, “View Accounts”, “View Planned Payments” or “View Budgets” button. The button names its destination and shows a directional arrow; tapping uses the existing navigation coordinator. It sits inside the native page pane, so it moves horizontally with that page and occupies no fixed-header space. The same control is available on web. The compact animated header, dropdown and bottom bar remain unchanged.

The button remains available after navigating or swiping, and supports explicit navigation when swipe gestures are unavailable. It disables during transitions, workplace switching, selection or an open drawer. Manual checks: enter every paired page, tap forward and back, swipe and cancel, verify the button travels with content and remains present on return, and check large text and RTL arrow direction. No tests or device checks were run. TypeScript reports the same two unrelated errors.

## Content subtabs replace the sibling button

The “View…” sibling button is replaced by a conventional two-tab strip: Accounts / Categories or Budgets / Planned Payments. Each pane highlights its own tab with a static underline and shows the sibling alongside it. Clicking the other tab navigates through the existing coordinator. The strip belongs to the page pane on native and web, so it travels horizontally with that pane; it does not stay in the main header or run a separate swipe animation. Singleton pages have no strip. The compact header and its dropdown are unchanged. No tests or device checks were run for this revision.

## V1 and V2 settings switch

The saved `homeScreenVersion` preference is validated, included in the persisted user-preference key registry, and shared by the settings view and home layout through `useHomeScreenPrefs`. The setting is also indexed by settings search. V1 no longer mounts a native pager for either the outer scene viewport or its nested sibling panes. V2 retains the native pager. Switching keys only the navigator content, preserving the router's selected route while resetting incompatible retained-index and gesture state.

Manual checks: switch both ways from Appearance and return to Accounts/Categories and Budgets/Planned Payments; confirm the selected route survives, V1 responds only to tab taps, V2 swipes, and both keep working after repeated switches. Restart the app and switch workplaces to confirm the preference persists. No tests or device runs were performed. TypeScript reports only the two existing unrelated errors.
