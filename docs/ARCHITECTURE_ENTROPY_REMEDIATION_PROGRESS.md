# Architecture entropy remediation — progress (2026-07-27)

Tracking against `ARCHITECTURE_ENTROPY_REMEDIATION_PLAN_2026-07-27.md`. Status: **near complete** — remaining work is optional `AccountService` test/e2e shrink and STS/doc polish.

## Done or substantially done

| Commits | Topic | Notes |
| --- | --- | --- |
| 1 | Verification baseline | Typecheck clean |
| 2 | Guardrail policy | `docs/CONVENTIONS.md`, `TEST_COVERAGE.md` STS ownership |
| 3–10 | Planned-payment commands | Commands, schedule policy, integration tests |
| 11–15 | Domain/UI journal timeline | DTOs, mapper, adapters, ESLint service→UI ban |
| 16 | Journal inventory | `docs/JOURNAL_REPOSITORY_INTENT_INVENTORY.md` |
| 17–21 | Journal intent modules + façade deleted | `check:journal-facade` |
| 22 | Account/transaction inventory | `docs/ACCOUNT_TRANSACTION_REPOSITORY_INTENT_INVENTORY.md` |
| 23–30 | Import boundary | Canonical import, `importRun`, workflow tests |
| 29 (partial) | Import persistence adapter | `importPersistenceAdapter.ts`; `ImportRepository` production path without `any` |
| 31–35 | Safe-to-Spend split | input acquisition, projection, snapshot writer |
| 37–41 | Account commands | rules, hierarchy, merge, adjust |
| 42 (substantial) | Account boundary | `accountQueries`, delete/audit/reconcile commands; audit handlers; onboarding uses `accountSystemAccounts`; `AccountService` thin delegator for legacy tests only |
| 43 | Report snapshot contract | `reportSnapshot.ts` |
| 44 | Report consolidation | `useReportBreakdownDetails` → `observeReportSnapshot`; heatmap/sankey helpers delegate to `getReportSnapshot` |
| 45 | Journal editor balance policy | `journalEditorBalancePolicy.ts`; `useJournalEditor` composes it |
| 46 (partial) | Account form policy | `accountFormValidationPolicy.ts`; hook uses pure duplicate check |
| 47 | SMS rule policy | `smsRuleFormPolicy.ts` + unit tests; form VM is field state + save |
| 48 (partial) | Stale shims removed | transaction card presentation re-exports deleted earlier |
| 49–51 | CI ratchets | hook mutation lint, unsafe-types baseline, journal façade guard |

## In progress / optional tail

| Commits | Topic |
| --- | --- |
| 36 | STS reassembly cleanup (no dead public API identified; read model already composes modules) |
| 42 (tail) | Remove `accountDomainService` delegator once tests import commands/system accounts directly |
| 48 | Further duplicate-path audit if new shims appear |
| 52 | Final entropy audit sign-off after full verify |

## Execution order (grill session)

**A (risk-first):** 29 → 42 → partial 52 → 44–47 → 22 / 48 / 36 → final 52.

## Verify locally

```bash
bun run typecheck
npx jest --coverage=false
bun run check:architecture
```

## ADRs / glossary

- ADR-0008 account mutations via commands; ADR-0009 import persistence adapter
- `CONTEXT.md` — Command, account read module, canonical import, audit revert

Per plan § Completion definition — **substantially met** for product code paths; open items are legacy test coupling to `AccountService` and documentation sign-off.
