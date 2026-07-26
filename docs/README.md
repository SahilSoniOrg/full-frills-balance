# Documentation index

When documents disagree, follow this order:

1. **[PROJECT_BIBLE.md](../PROJECT_BIBLE.md)** — measured facts, invariants, debt register
2. **[adr/](adr/)** — why specific decisions were made (update status when implemented)
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** — layer map and subsystem overview
4. **[CONTEXT.md](../CONTEXT.md)** — domain glossary
5. Everything else — plans, audits, matrices (may lag code)

## Active references

| Document | Use when |
|----------|----------|
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Phased engineering queue (check off here) |
| [CONVENTIONS.md](CONVENTIONS.md) | Naming, boundaries, ratchets (includes architecture checks) |
| [FEATURE_MATRIX.md](FEATURE_MATRIX.md) | UI/feature completeness snapshot |
| [KNOWN_GAPS_AND_RISKS.md](KNOWN_GAPS_AND_RISKS.md) | Product-facing limitations and P3 UX notes |
| [TEST_COVERAGE.md](TEST_COVERAGE.md) | Where tests live; E2E journey map |
| [CHANGELOG.md](CHANGELOG.md) | Release notes (EAS build tags) |
| [FUTURE_ROADMAP.md](FUTURE_ROADMAP.md) | Longer-term product ideas (not the eng queue) |
| [codebase-design/AUDIT.md](codebase-design/AUDIT.md) | Module-depth design review backlog |
| [DESIGN.md](../DESIGN.md) | Visual design system (UI work) |
| [PRIVACY.MD](../PRIVACY.MD) | Privacy policy |

## Developer guides

In-repo guides live in **[guides/](../guides/)** (components, data & state, testing, performance, security, etc.). They are explanatory; verify toolchain commands against `package.json` and PROJECT_BIBLE §8.

## Point-in-time audits (archived context)

These captured a specific date’s entropy/remediation work. **Archived** under [archive/2026-07-entropy/](archive/2026-07-entropy/README.md).
- [codebase-design/surveys/](codebase-design/surveys/) — 2026-07-24 module inventories

Repository intent inventories (journal, accounts) are working notes for refactors:

- [JOURNAL_REPOSITORY_INTENT_INVENTORY.md](JOURNAL_REPOSITORY_INTENT_INVENTORY.md)
- [ACCOUNT_TRANSACTION_REPOSITORY_INTENT_INVENTORY.md](ACCOUNT_TRANSACTION_REPOSITORY_INTENT_INVENTORY.md)

## Plans (may be stale)

Single-feature or one-off plans — confirm against code before executing:

- [SCREEN_HEADER_STANDARDIZATION_PLAN.md](SCREEN_HEADER_STANDARDIZATION_PLAN.md)
- [WIDGETS_PLAN.md](WIDGETS_PLAN.md)
- [PERFORMANCE_ROADMAP_PHASE_2.md](PERFORMANCE_ROADMAP_PHASE_2.md)
- [TEST_CASES_50_MAP.md](TEST_CASES_50_MAP.md)
- [PLAY_STORE_LISTING.md](PLAY_STORE_LISTING.md)
