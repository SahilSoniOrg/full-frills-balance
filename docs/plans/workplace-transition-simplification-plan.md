# Workplace transition simplification plan

Status: implementation record; follow-up verification remains

## Implemented outcomes

The following fixes are now committed locally:

- committed deletion distinguishes database success from cleanup warnings;
- launch pointer-repair failure no longer blocks a validated Workplace;
- deleted Workplace caches are evicted for active and non-active deletion;
- Settings no longer re-queries or chooses the post-delete route;
- ADR and architecture records now describe the intended ownership;
- the superseded oversized remediation plan was removed.

The deletion ordering is implemented through the committed loading/unmount render boundary and is covered indirectly by the existing transition tests. A direct coordinator test was attempted and intentionally not kept: the mocked provider made React’s effect-owned deletion promise produce harness lifecycle errors, so adding more test-only orchestration would increase the complexity this plan is meant to remove.

## Design constraints

- Database publication remains the commit point.
- Preference and cache cleanup after that point is recoverable follow-up work.
- Settings owns confirmation and presentation only.
- The launch resolver remains pure.
- No generic coordinator, state-machine, repository, or persistence framework.
- Prefer deletion and existing seams over new abstractions.

## Small commits

- [ ] Add a direct coordinator test for Active books unmounting before database deletion when a stable test seam exists.
- [x] Implement a two-phase deletion transition: commit the unmounted/loading state, then delete.
- [x] Return explicit deletion outcomes and preserve post-commit warnings.
- [x] Make pointer, Workplace-preference, and analytics cleanup best-effort after database commit.
- [x] Evict deleted Workplace caches for both active and non-active deletion.
- [x] Serialize service-level switch and delete operations.
- [ ] Add direct coordinator tests for failed pointer repair and deletion races.
- [x] Prevent pointer-repair failure from leaving launch permanently loading.
- [ ] Add serialization tests for duplicate switch/delete requests and rollback.
- [x] Remove Settings re-query and post-delete navigation.
- [x] Clarify Active-pointer ownership in ADR-0002 and related docs.
- [x] Remove the superseded oversized remediation plan.
- [ ] Extract coordinator modules only if direct tests show a stable, complexity-reducing seam.
- [x] Complete final architecture and full verification review.

## Acceptance criteria

- Active books are unmounted before deletion begins.
- Database failure leaves books, pointer, preferences, caches, and route unchanged.
- Post-commit cleanup failure never claims books were unchanged.
- Post-commit pointer failure does not strand the app on a loading screen.
- Settings does not decide the post-delete Workplace or route.
- Repeated deletion is a no-op success.
- Switching and deletion have one production orchestration path.
- Architecture docs describe the implementation they govern.
- No push occurs; all changes remain as local commits.

## Out of scope

- Device inbox tenancy.
- Cloud identity, membership, or RBAC.
- Durable import phase recovery.
- A new generic orchestration framework.
- Broad state-management or WatermelonDB rewrites.
