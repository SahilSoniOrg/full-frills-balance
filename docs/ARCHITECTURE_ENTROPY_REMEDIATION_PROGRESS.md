# Architecture entropy remediation — progress (2026-07-27)

Tracking against `ARCHITECTURE_ENTROPY_REMEDIATION_PLAN_2026-07-27.md`. Status: **near complete** — optional tail: shrink `AccountService` test coupling, final audit sign-off.

## Done or substantially done

| Commits | Topic | Notes |
| --- | --- | --- |
| 1–2 | Baseline + guardrails | Typecheck, CONVENTIONS, CI scripts, CONTEXT glossary |
| 3–10 | Planned-payment commands | Bundled in guardrails commit with ratchet scripts |
| 11–15 | Journal timeline + adapters | DTOs, mappers, `transactionCardAdapter` |
| 16–21 | Journal intent modules | Façade deleted; `check:journal-facade` |
| 22 | Account/transaction inventory | `ACCOUNT_TRANSACTION_REPOSITORY_INTENT_INVENTORY.md` |
| 23–30, 29 | Import boundary + adapter | Canonical import, `importRun`, persistence adapter |
| 31–35 | Safe-to-Spend split | input acquisition, projection, snapshot writer |
| 37–42 | Account commands + queries | ADR-0008; audit/onboarding on commands/system accounts |
| 43–44 | Report snapshot | Feature hooks + consolidated `ReportService` helpers |
| 45–47 | Editor/SMS/form policy | balance policy, `accountFormValidationPolicy`, `smsRuleFormPolicy` |
| 48–51 | Ratchets + lint | hook mutations, unsafe-types baseline, journal façade guard |

## Verify locally

```bash
bun run typecheck
npx jest --coverage=false
bun run check:architecture
```

Last verify: typecheck clean; **131 suites / 817 tests** pass; `check:architecture` OK.

## ADRs

- `docs/adr/0008-account-mutations-via-commands.md`
- `docs/adr/0009-import-persistence-adapter.md`

Per plan § Completion definition — **substantially met** for production paths; remaining work is legacy `accountDomainService` delegator in tests and entropy audit doc refresh.
