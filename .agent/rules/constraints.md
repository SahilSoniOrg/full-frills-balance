---
trigger: model_decision
description: Strict architectural and coding constraints for the codebase
---

# Strict Constraints

MUST NOT — violations are defects. See `quirks.md` for repo-specific traps.

## KISS
- **NO Clever UI Math**: UI must not compute complex metrics; projections pure/memoized.
- **NO State Duplication**: Never mirror WatermelonDB in local React state.
- **NO Render Side-Effects**: No API, DB, or state mutations during render.

## DRY
- **NO Custom Math/Rounding**: Use `BalanceService` or `currencyRepository`.
- **NO Sibling Imports**: Public boundary only: `@/src/features/<feature>/index.ts`.
- **NO External Pickers**: `@/src/components/common/CustomDateTimePicker` only; no picker packages.

## YAGNI
- **NO Speculative Code**: No columns, models, routes, or fields without active screen consumers.
- **NO Custom Folders**: Directories only under `src/` and `app/`.

## SOLID & SRP
- **NO UI Database Writes**: No `database.write` in components; use repositories.
- **NO Business Logic in Routes**: `app/` is layout and routing only.
- **NO `app/` Imports in `src/`**: Core code never imports routing layer.
- **NO Feature Imports in `src/data/`**: Data layer never depends on feature UI.
- **NO UI in Services**: `src/services/` has zero presentation logic.

## Clean Code
- **NO `any` Types**: Narrow `unknown` or define interfaces.
- **NO Hardcoded UI Tokens**: Use `@/src/constants/design-tokens`.
- **NO `console.log`**: Use `@/src/utils/logger`.
- **NO Drive-by Refactors**: Diffs scoped to the active task only.
- **NO Ad-hoc DB IDs**: Canonical DB UUIDs only.

## Feature Nevers
- **Accounts**: No tree/hierarchy sort logic in list-item UI nodes.
- **Journal**: No unbalanced journal (`sum debits != sum credits`).
- **Reports**: No state mutation inside report calculation/projection.
- **Onboarding**: No transient wizard state in core app loops.
- **Wealth**: No net worth/wealth projection from UI state; no persisting projections in DB tables.
- **Planned Payments**: No planned payments as active `journal` records.
