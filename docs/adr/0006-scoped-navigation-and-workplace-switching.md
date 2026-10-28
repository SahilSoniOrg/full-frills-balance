# Scoped navigation and workplace switching

**Status:** Accepted

## Context

The primary navigator has four visible daily groups, six ordered page routes, and a contextual creation action. Workplace switching is available from every primary root, while Settings shortcuts must return to the exact page that opened them. Financial data, filters, selections, privacy overrides, and drafts belong to a specific workplace.

Changing the device's active workplace pointer alone does not make a switch safe: the destination snapshot may still be loading or may fail, and route-scoped state may still refer to records from the previous workplace.

## Decisions

- The fixed bottom bar contains Dashboard, Accounts, Add, Plans, and Activity in that order. Add is an action whose options follow the committed primary page's group.
- The native primary page order is Dashboard (`index`), Accounts (`accounts`), Categories (`categories`), Budgets (`commitments`), Planned Payments (`planned-payments`), and Activity (`activity`). Accounts/Categories share the Accounts group; Budgets/Planned Payments share the Plans group. A group tap returns to that group's last committed page, defaulting to Accounts or Budgets on first visit. Pages are real routes under `(tabs)`; the pager and router share one selected-route owner. Web retains the same route model and controls without touch paging.
- Native horizontal paging is limited to primary roots. A Dashboard rightward body gesture opens the full-width drawer and a leftward gesture advances to Accounts; elsewhere the drawer remains edge-triggered. The open drawer owns its close gesture. Chart and row-removal child gestures explicitly block the page recognizer. Native Android/iOS arbitration and release performance remain device acceptance gates.
- Legacy `accounts?tab=accounts|categories` and `commitments?tab=budgets|planned` links normalize to canonical leaf routes through replacement, with unrelated route parameters preserved.
- An in-app Back from a non-Dashboard primary page returns to Dashboard without pushing pager swipes onto the outer Stack. The drawer consumes Back before the primary-page policy. Details, Settings, and creation flows return to the exact leaf page that opened them. Dashboard delegates to surrounding navigation/system behavior.
- The active workplace stays visible in the navigation drawer. Switching workplaces leaves the drawer open so the selected workplace is immediately clear.
- A shared User/workplace header opens a workplace-first drawer. Its workplace, personal, device, and All settings sections reuse existing destinations and ownership boundaries.
- Settings and drawer shortcuts are pushed over the current route. Restore exits dismiss back to Settings rather than pushing it over the finished journey. Settings is not a primary tab.
- The launch coordinator owns workplace transitions. During a switch, the previous Workplace provider remains committed under a blocking overlay while the target workplace is validated. Record routes are cleared under that overlay, then the active pointer is written and the new provider is revealed.
- A successful switch preserves the primary tab and subtab. Record-specific routes are removed from the entire back stack and return to the corresponding list/subtab, and workplace-specific selections and filters reset. A failed switch retains the prior scope and leaves a retryable drawer error.
- Primary tabs and detail routes (including Settings and data-management) remount their content when the committed workplace changes, so no screen-local state or observed data outlives its workplace; in-flight multi-workplace flows such as Create Backup are discarded on switch. Navigation state and route params (including subtabs) are kept. Creation routes are not remounted so their bound drafts survive. A switch that does not commit within 15 seconds fails and leaves the prior scope. Correctly keyed caches remain isolated and follow their normal freshness rules; switching alone does not evict them. Caches are disposed when their workplace is deleted.
- Every creation route carries its launch workplace ID; direct links without one capture the initial provider ID once (`useWorkplaceLaunchBinding` / `useLaunchWorkplaceId`). Save handlers call `assertBoundWorkplace` before writing; `WorkplaceBoundScreen` also blocks interaction on mismatch. A draft is never silently retargeted.
- Drawer entry is disabled while selection mode or a workplace transition is active. Add stays available during selection and is disabled only while a workplace transition is active.

## Consequences

- Workplace identity and visible financial data stay paired through loading and failure.
- Switching from a detail route cannot resolve the old record ID in another workplace.
- Settings, reports, and other shortcuts retain normal Back behavior to the originating tab/subtab.
- The UI uses the existing local User identity and existing create/import/settings flows; it introduces no authentication, membership, synchronization, or account-management model.
