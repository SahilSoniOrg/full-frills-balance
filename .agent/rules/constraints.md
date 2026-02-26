---
trigger: model_decision
description: Strict architectural and coding constraints for the codebase
---

# Strict Constraints & Boundaries

This document defines what you MUST NOT do. Violations are defects.

## 1. Architectural Negations
- **NO Business Logic in `app/`**: Route files are for wiring only. No calculations, data access, or orchestration.
- **NO `src/**` imports from `app/**`**: This direction is strictly forbidden.
- **NO Deep Imports**: Never import from a sibling feature's internal files. Use `@/src/features/<feature>/index.ts` only.
- **NO Feature-Feature Direct Imports**: Features must be independent. Common logic belongs in `services` or `utils`.
- **NO Feature Imports in `src/data/`**: Data layer must not depend on UI or feature logic.
- **NO UI logic in `src/services/`**: Services are for domain logic, not presentational concerns.
- **NO New Top-Level Buckets**: Do not create directories outside the established structure without approval.

## 2. Persistence Constraints
- **NO Direct DB Writes in UI**: Presentational components must never call `database.write`. Use repositories.
- **NO Ad-hoc IDs**: Never use `Math.random` or `Date.now` for database record IDs.
- **NO Duplicated Source of Truth**: WatermelonDB is the SOO. Do not sync DB state into long-lived React state unnecessarily.

## 3. Implementation Constraints
- **NO `any` types**: Use strict TypeScript. Narrow `unknown` if necessary.
- **NO hardcoded UI values**: Use semantic tokens from the design system.
- **NO `console.log`**: Use `@/src/utils/logger` for all app-level logging.
- **NO drive-by refactors**: Keep diffs focused strictly on the task at hand.
- **NO side-effects in render**: Derived values must be pure projections or memoized.

## 4. Feature-Specific "Never" Rules
- **Accounts**: Never put reorder/hierarchy logic in list-item components.
- **Journal**: Never save an unbalanced journal (debits != credits).
- **Reports**: Never mutate state from a report projection.
- **Onboarding**: Never leak onboarding-only state into global app logic.
- **Wealth**: Never calculate net worth using transient UI state; use canonical balances.
- **Planned Payments**: Never treat Planned Payments as `journals` records in the DB; they are high-level rules.
