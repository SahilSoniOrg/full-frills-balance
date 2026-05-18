---
trigger: model_decision
description: Strict architectural and coding constraints for the codebase
---

# Strict Constraints & Boundaries
Defines what you MUST NOT do. Violations are defects.

## 1. KISS Boundaries
- **NO Clever UI Math**: UI layers must not compute complex metrics. Projections must be pure/memoized.
- **NO State Duplication**: Never mirror WatermelonDB state in local React state.
- **NO Render Side-Effects**: No API, DB, or state mutations within component render execution.

## 2. DRY Boundaries
- **NO Custom Math/Rounding**: Rounding/precision lookups must call `BalanceService` or `currencyRepository`.
- **NO Sibling Imports**: Import strictly from public module boundary: `@/src/features/<feature>/index.ts`.
- **NO External Pickers**: Always use `@/src/components/common/CustomDateTimePicker`. Do not install pickers.

## 3. YAGNI Boundaries
- **NO Speculative Code**: Never add columns, models, routes, or fields without active screen consumers.
- **NO Custom Folders**: Do not create directories outside `src/` and `app/`.

## 4. SOLID & SRP Boundaries
- **NO UI Database Writes**: Components must never call `database.write`. Use repository operations.
- **NO Business Logic in Routes**: Route files in `app/` are strictly for layout and screen routing.
- **NO `app/` Imports inside `src/`**: Core code inside `src/` must never import from the routing structure.
- **NO Feature Imports in `src/data/`**: Data layer must never depend on feature UI or layouts.
- **NO UI in Services**: Service engines inside `src/services/` must contain zero presentation logic.

## 5. Clean Code Boundaries
- **NO `any` Types**: Narrow `unknown` or write interfaces. No `any` allowed.
- **NO Hardcoded UI Tokens**: Always use semantic design tokens from `@/src/constants/design-tokens`.
- **NO `console.log`**: Production code must use unified `@/src/utils/logger`.
- **NO Drive-by Refactors**: Diffs must focus exclusively on the specific active task.
- **NO Ad-hoc DB IDs**: Never generate IDs with custom math or timestamps. Use canonical DB UUIDs.

## 6. Feature "Nevers"
- **Accounts**: Never embed tree/hierarchy sorting logic inside list-item UI nodes.
- **Journal**: Never save unbalanced journal (sum of debits != sum of credits).
- **Reports**: Never mutate state variables inside a report calculation or projection.
- **Onboarding**: Never leak transient wizard state into core application loops.
- **Wealth**: Never calculate net worth or wealth projections using local UI component state.
- **Planned Payments**: Never store planned payments directly as active `journal` database records.
