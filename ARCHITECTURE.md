# Architecture Standards

Canonical architecture rules and strict constraints are maintained in:

- `.agent/rules/constraints.md` (Negations & Boundaries)
- `.agent/rules/quirks.md` (Common Pitfalls)
- `AGENTS.md` (Operating Rules)

## Non-negotiables

- **Isolation**: No `src/**` imports from `app/**`. No deep imports across sibling features.
- **Truth**: WatermelonDB is the single source of truth.
- **Ownership**: Repository-owned writes (no direct persistence from presentational UI).
- **Thin Routes**: `app/` is for wiring only; no logic or data access.

For detailed decision trees and "never" rules, refer to `.agent/rules/constraints.md`.
