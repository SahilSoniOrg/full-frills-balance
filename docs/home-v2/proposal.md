# Home V2 exploration

Historical proposal: this records the investigation and rollout choices before V1 was removed. File paths below identify the code inspected at that time, including components that have since been deleted. The current single-layout implementation and manual checks are documented in [implementation.md](implementation.md).

## Decision

Use one horizontal pager across Dashboard → Accounts → Categories → Budgets → Planned Payments → Activity. Four bottom destinations remain Dashboard, Accounts, Plans, Activity. Accounts and Plans restore their last visited leaf on bottom-tab taps. A fixed header above the pager owns the group title, page actions and sibling selectors. Explicit sibling selectors address canonical leaf routes. A swipe always advances one leaf regardless of its starting position in the page (except deliberate child interactions and system edges).

Verdict: Fixable. The failure point is competing gesture ownership plus destination readiness, not a lack of animation effects.

## Evidence and limits

This is a scoped static investigation, not a repository-wide performance audit. No current-tree frame-time or query-cost claims are established.

| Evidence | Source | Consequence |
| --- | --- | --- |
| Four-group outer native pager and two nested sibling pagers | `src/features/navigation/PrimaryPagerNavigator.shared.tsx`, `src/navigation/GroupInnerPager.tsx` | Two navigation layers reconcile a single route; horizontal behavior depends on gesture location. |
| Inner boundary handoff uses 28-point overlays and a 48-point completion threshold | `src/navigation/GroupInnerPager.tsx` | Crossing a group boundary uses a separate recognizer and JS navigation after gesture completion. It cannot provide continuous finger tracking across that boundary. |
| Bottom tabs and Add disable while transitioning | `src/features/navigation/PrimaryTabBar.tsx` | Repeated navigation intent is explicitly rejected during the transition. This is established behavior, not a measured latency finding. |
| Native progress already writes a Reanimated shared value | `src/features/navigation/PrimaryPagerViewport.native.tsx` | Keep this foundation; replacing it with JS frame-by-frame state would regress the architecture. |
| Visited groups are retained; neighboring groups mount after idle | `src/features/navigation/PrimaryPagerNavigator.shared.tsx` | A blanket keep-alive rewrite duplicates existing work. First-entry readiness still differs from return visits. |
| Active Accounts observer switches to EMPTY off-group; dashboard gates reads by active state | `src/features/accounts/AccountsGroupProvider.tsx`, `src/features/dashboard/hooks/useDashboardViewModel.ts` | Re-entry can resubscribe even with retained UI. Measure replay/recalculation separately from remounts. |
| Both Accounts and Categories view models mount together, sharing provider preferences and data | `src/features/accounts/components/AccountsGroupPager.tsx` | Audit duplicated report effects and transformations before splitting into flat leaves. Both call sites use router focus rather than explicit leaf activation for the rolling-period report. Duplicate runtime requests remain a hypothesis. |
| Observable dependencies change through a layout-effect revision, then subscription effect | `src/hooks/useObservable.ts` | Activation may entail additional commits. Do not rewrite this app-wide hook without isolated evidence. |
| Existing benchmark: Budget readiness median 589ms (562–616ms); ordinary JS callback p95 barely changed | `docs/performance/swipe-navigation-benchmark-2026-10-29.md` | Deferred work exchanged startup work for entry delay. These are historical simulator results on an overlap stress fixture, not measurements of this working tree or native dropped frames. |

The bar is already outside RemountOnWorkplace. A route change does not, by itself, prove that the bar remounts. Investigate render/commit cost and transition disable behavior; do not describe every visible hitch as a reload.

## Experience contract

- Keep one persistent bottom rail and one Add action. Use a small progress marker that follows native movement; labels and accessibility selection change only at committed selection.
- Each page has its own content hierarchy and scroll position. Accounts/Categories and Budgets/Planned Payments retain explicit sibling selectors. Moving between leaves slides only the content below the fixed header; selectors navigate the same pager. Accounts/Categories share one stationary selector instance, as do Budgets/Planned Payments. The header and bottom rail never travel horizontally.
- Keep header geometry stable across groups, with a reserved selector/action slot to prevent vertical content jumps. Change the group title and controls only when selection commits; cancelled drags keep the current header. A sibling indicator may track native progress without rebuilding the header. Header actions target the committed leaf; suppress leaf-specific mutations during unresolved movement. Header selectors stay tap-responsive through the same latest-intent coordinator. Swipes begin in the content region; the fixed header is a control surface, not another horizontal pager.
- Let finger movement determine native drag/settle physics. No second spring or entrance animation on page content. Reduce Motion removes automatic travel on taps; direct manipulation remains usable.
- On a distant bottom-tab tap, switch directly to the target leaf rather than sweeping across unrelated pages. Adjacent taps may animate. Screen-reader navigation uses explicit controls.
- Bottom tabs remain responsive. During a finger-owned drag, retain the latest requested destination and execute after idle; do not issue setPage mid-drag. During programmatic settling, retain latest intent and apply at idle. Announce only the final committed destination.
- Remove the Dashboard overscroll-to-drawer shortcut and nested edge overlays from V2. Keep a visible menu control; reserve platform edge gestures. This intentionally gives the pager a single responsibility.
- Preserve privacy masks, workplace isolation, selection workflows, deep links, keyboard handling, lock/background behavior, chart scrubbing, row actions, error recovery, and accessibility navigation.

## Native architecture

Keep Expo Router canonical routes and the installed native PagerView/Reanimated foundation. Flatten the six leaf scenes rather than wrapping existing GroupInnerPager shells inside another pager.

The persistent header and bottom rail sit outside the content pager and do not subscribe to page query state. Group selectors are stable controls, not duplicated inside scenes.

One coordinator owns `settledLeaf`, `requestedLeaf`, transition origin, interaction epoch, and permission state. A UI-thread shared value owns continuous progress. React route/data state does not update on each scroll event.

Native selection and idle callbacks may arrive in either order. Record native selection independently, reconcile it at idle, and commit route identity exactly once. Filter programmatic callbacks by target and epoch. A delayed callback from an obsolete request cannot overwrite a newer destination. Every transition must terminate through success, cancellation, permission loss, or unmount.

External deep links and Back use the same coordinator. Canonical route identity stays authoritative for restoration. On permission loss, stop interaction and restore the last committed leaf without animation. Workplace changes cancel requests and invalidate all old-workplace results before any new paint.

Extract leaf scenes from group shells. Shared Accounts data/preferences can stay in a provider above both leaves; leaf-specific search, selection and report effects need explicit ownership. Do not use descriptor/router keys as retained scene keys; use stable leaf identity scoped to workplace.

## Data and rendering contract

Do not consolidate every domain into a giant home query. Use existing domain services behind leaf-scoped read adapters.

| Scene state | Paint | Work |
| --- | --- | --- |
| Selected | Last valid snapshot immediately; refresh locally | Subscribe to required live reads; defer nonessential charts/details until idle |
| Adjacent | Retained paint or stable first-entry placeholder | After idle, prepare one lightweight first viewport; cancel obsolete requests |
| Visited, distant | Preserve UI/scroll state and last paint | Pause costly live work; resume with snapshot on selection |
| Never visited, distant | No heavy scene | No query or list construction |

Cache keys include workplace, currency, filters, period and applicable data revision. Cached financial values must preserve stale/quality metadata; an old amount must never masquerade as current actionable balance. Known-empty is a ready state, distinct from not-yet-loaded. A failed refresh leaves previous paint visible with inline Retry. Actions requiring fresh derived financial data remain gated by readiness.

One adapter owns each report request. Deduplicate concurrent equal requests; cancellation suppresses obsolete publications even if the underlying promise cannot abort. Bound cache lifetime and clear on workplace deletion/sign-out. No persistent extra copies of private financial data are needed for the concept.

Keep list instances stable and virtualized. Do not animate row entrances on focus. Preserve loading/error/empty layouts to avoid height jumps. Shared chrome consumes small navigation state rather than page query state.

Memory is the tradeoff: six fully active lists and observers are not free. Start with retained visited UI plus bounded data work; measure retained native views and heap before deciding whether to evict distant scenes. If evicting, persist scroll/filter state explicitly.

## Alternatives considered

| Approach | Benefit | Failure mode | Verdict |
| --- | --- | --- | --- |
| Flat native pager | One gesture owner; existing native stack | Library physics and interruption behavior need device validation | Preferred first implementation |
| Custom Reanimated/Gesture Handler pager | Precise velocity, distance and spring control | Owns gesture arbitration, RTL, accessibility, rotation and interruptions | Fallback only if native behavior fails measured acceptance |
| Tap-only tabs | Removes horizontal competition | Loses the swipe interaction requested here | Rejected for this brief |

## Delivery slices

1. Add a development-only Home V2 switch; keep V1 selectable. No finance logic rewrite.
2. Extract all six leaf scenes, preserving actions, IDs, accessibility and privacy. Build the flat coordinator, fixed header with sibling selectors, and persistent rail. Remove nested pagers only in V2.
3. Add explicit leaf activation and snapshot-first adapters; fix duplicate request ownership where traces establish it. Move nonessential work after settle.
4. Redesign each page around its real tasks, including long lists, filters, stale/error/empty states and selection. The concept illustrates navigation and hierarchy; it is not a complete functional replacement of those workflows.
5. Validate navigation regressions with matched release runs. V2 is now the default in all builds, with V1 available through settings.

## Acceptance plan (not executed)

Use the historical synthetic fixture for comparison plus empty and ordinary datasets. Match build, platform, dataset and trace boundaries. Use physical iOS and Android devices for recognizer behavior and native hitch evidence.

Record gesture start → first native movement, native settle, route commit, first useful destination paint, query/subscription counts, React commits, native frame hitches and retained memory separately. Do not use JS rAF gaps as native FPS.

Exercise cold first visits; warm returns; swipes across every leaf boundary; cancelled/reversed swipes; rapid alternating taps; taps during dragging/settling; delayed callback ordering; deep links; Android Back; rotation; app background/lock; workplace switching during query/gesture; charts, row actions and selection; RTL; Reduce Motion; screen reader; keyboard; and refresh errors. Retained pages must keep scroll position and filters; no old-workplace content may flash.

Initial targets to validate, not promises: immediate first movement with no database dependency, zero route commits per animation frame, no navigation-chrome remount per leaf switch, no horizontal header travel or vertical content jump at group boundaries, and no full-page loading replacement on warm returns. Derive numeric frame/readiness budgets from matched device baselines.

## References

- Native pager API and platform behavior: https://github.com/callstack/react-native-pager-view (upstream main may differ from installed 9.0.7; inspect installed implementation before coding).
- Reanimated native event handling: https://docs.swmansion.com/react-native-reanimated/docs/2.x/fundamentals/custom_events/ (concept reference; use installed v4 signatures).
- Existing app motion research: `docs/design/navigation-motion.md`.
