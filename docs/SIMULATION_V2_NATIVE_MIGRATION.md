# Simulation V2 Native Migration Plan

This plan describes the steps needed to rebase the app on the V2 simulation contract without the legacy `SimulationResult`/`buildLegacySimulationResult` translation layer.

## Goals
1. Stop translating V2 flows back into V1-shaped outputs inside the service.
2. Let the notification/UI layers derive summaries/breakdowns directly from `SimulationResultV2` (flows + summary metadata).
3. Remove `buildLegacySimulationResult` once no consumer relies on its V1-only fields.

## Migration Phases

### Phase 0: Preparation
- Document the new, app-facing V2 contract (summary fields, projections, metadata) and list the legacy fields we are retiring.
- Ensure the V2 simulator exposes the raw flows, projections, account summaries, and metadata required by the UI.

### Phase 1: API/Helper Support
- Add `simulateV2` (or a similar API) to `CashFlowSimulationServiceV2` that returns a `V2SimulationRunResult` containing the simulator output plus `allFlows` and derived account summaries.
- Factor the legacy builder logic into a dedicated presenter/helper so it can be reused temporarily for backward-compatible consumers and later removed.
- Keep `simulate()` tied to the legacy contract until the UI is fully migrated.

### Phase 2: Consumer Migration
- Update `NotificationService.observeSafeToSpend` to call `simulateV2`, derive the breakdowns/summary/projections from the V2 data, and emit a new contract (e.g., `SafeToSpendLiveResult`) with only the fields the UI needs.
- Refactor `SafeToSpend` UI components/hooks (`useSafeToSpendView`, `DashboardScreenView`, legend/explanation modals, widget sync) to consume the new contract instead of `SimulationResult` (remove `breakdowns`, `flowByDayOffset`, etc. from their assumptions).
- Update any tests/mocks/snapshots that currently assert on legacy fields to either cover the new contract or use the new helper.

### Phase 3: Cleanup
- Once consumers no longer depend on the legacy structure, delete `buildLegacySimulationResult` and remove V1-only fields from `src/services/simulation/types.ts`.
- Delete the temporary presenter/helper if it is no longer needed.
- Validate parity via existing V2 tests (or updated ones) to ensure flows still generate the expected results.

## Risks & Inputs
- Derived breakdown values (budget/debt/committed) must be recalculated from V2 flows; this is where behavior can drift if the logic diverges.
- Search for remaining references to `flowByDayOffset`, `safeToSpendDailyBreakdown`, and `breakdowns` in the repo to confirm all consumers are migrated before removing them.
- Preserve any performance-sensitive caches that existed in the legacy path (e.g., budget daily burns) when recomputing them from flows.

## Next Action
- Start by implementing the new `simulateV2`/helper API and documenting the contract in this doc; once that is ready we can refactor the notification/UI layers.
