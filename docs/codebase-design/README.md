# Codebase design docs

Living design-review artifacts for Full Frills Balance, using the **deep Module** vocabulary (Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality).

## Start here

1. **[AUDIT.md](./AUDIT.md)** — executive summary, cluster verdicts, ranked deepening backlog, Design-It-Twice decisions, pass-through hit list.
2. **[surveys/](./surveys/)** — full Module-by-Module inventories from the 2026-07-24 whole-repo sweep (evidence for the AUDIT).
3. Cursor canvas **`codebase-design-audit`** — interactive overview (open beside chat in Cursor).

## Survey index

| File | Cluster |
|------|---------|
| [surveys/services.md](./surveys/services.md) | `src/services/**` overview |
| [surveys/reports_sim.md](./surveys/reports_sim.md) | Reports, simulation, STS, budget, balance, rebuild |
| [surveys/journal.md](./surveys/journal.md) | Journal domain, ledger, repositories, editors |
| [surveys/data_features.md](./surveys/data_features.md) | Data layer + feature view-models |
| [surveys/ai_sms.md](./surveys/ai_sms.md) | AI/LLM, ingestion Pipeline, SMS, prefs, money |
| [surveys/sms_import.md](./surveys/sms_import.md) | SMS, import/export, large repos, prefs/navigation |
| [surveys/ui.md](./surveys/ui.md) | Hooks, components, design-system, constants |

## How to update

When you deepen a Module:

1. Check off / re-rank items in AUDIT §6 and §13.
2. Add a short “Done” note under AUDIT §8 or a new § “Changelog”.
3. Optionally trim the matching survey section so it does not contradict the AUDIT.
4. Fix [ARCHITECTURE.md](../ARCHITECTURE.md) / [CONTEXT.md](../../CONTEXT.md) if ownership or glossary terms moved.

## Related project docs

- [ARCHITECTURE.md](../ARCHITECTURE.md) — layers (may lag this AUDIT)
- [CONTEXT.md](../../CONTEXT.md) — domain glossary
- [KNOWN_GAPS_AND_RISKS.md](../KNOWN_GAPS_AND_RISKS.md) — product/tech risks (orthogonal)
