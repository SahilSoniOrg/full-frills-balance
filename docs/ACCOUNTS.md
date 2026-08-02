# Accounts — spine map

**Hop count (create → delete → detail balance)**  
- **before:** 23 files · 2026-08-02 · `db79af81`  
- **after:** 18 files · 2026-08-02 · _(this lane)_ — see list below  
- **Exception to 50% target:** 23 → 18 (−22%) is the honest drop without rewriting ReactiveDataService or splitting every command sibling. Further cuts need lane 1.1 / journal-adjacent work.  
- **Entry files for the timed tour:** `useAccountActions.ts`, `useAccountDetailsViewModel.ts`

### After tour (files opened)

**Create**
1. `src/features/accounts/hooks/useAccountActions.ts`  
2. `src/services/accounts/accountCommands.ts` (inputs folded in)  
3. `src/services/accounts/accountRules.ts`  
4. `src/services/accounts/accountSystemAccounts.ts`  
5. `src/services/accounts/accountReferenceGraph.ts`  
6. `src/data/repositories/AccountRepository.ts`  
7. `src/data/models/Account.ts`  
8. `src/services/ledger/ledgerWriteService.ts`  
9. `src/services/audit-service.ts`  
10. `src/data/repositories/TransactionRepository.ts`  

**Delete**
11. `src/features/accounts/hooks/useAccountDetailsViewModel.ts`  
12. `src/features/accounts/hooks/details/useAccountDetailsActions.ts`  
13. `src/services/accounts/accountDeleteCommands.ts`  
(+ reference graph, repo, audit already counted)

**Detail balance**
14. `src/features/accounts/hooks/details/useAccountDetailsData.ts`  
15. `src/features/accounts/hooks/useAccountDashboard.ts`  
16. `src/services/ReactiveDataService.ts` — composite account+balance+subs  
17. `src/features/accounts/hooks/details/useAccountDetailsMetrics.ts`  
18. `src/services/accounts/accountDerivedReads.ts` — period metrics / unreconciled / chart  

*(Entity list reads use `accountQueries` via `useAccounts.ts` when needed; not required for this three-action tour.)*

### Before tour (historical — `db79af81`)

Fat `useAccounts.ts` mixed reads+writes+dashboard; `accountReadService` name; separate `accountCommandInputs.ts`; hierarchy/merge command files opened while reading the fat actions hook; derived vs dashboard path unclear.

---

## What an Account is

An **Account** is a ledger entity: Asset, Liability, or Equity (physical/legal holding of value).  
A **Category** is Income or Expense — same `accounts` table, different types.  
See [CONTEXT.md](../CONTEXT.md).

**Workplace** scopes nearly every query. Assume workplace-scoped until proven otherwise.

## Start here (≤6 layers)

| Layer | Home | Job |
|-------|------|-----|
| 1. Map | `docs/ACCOUNTS.md` (this file) | Onboarding |
| 2. Commands | `src/services/accounts/*Commands.ts` — hub: `accountCommands.ts`; siblings: hierarchy, merge, delete, adjust, reconcile, audit | **Writes** — only supported mutation path |
| 3. Entity reads | `src/services/accounts/accountQueries.ts` | Observe/find Account rows |
| 4. Derived reads | `src/services/accounts/accountDerivedReads.ts` | Targeted balance, unreconciled, period metrics, chart feeds |
| 5. Reference policy | `src/services/accounts/accountReferenceGraph.ts` | FK inventory + write assert / delete block / import plan |
| 6. Feature wiring | `useAccountActions.ts` + `useAccountDetailsViewModel.ts` (+ `useAccountDashboard.ts` for details composite) | Hooks → commands / queries / derived / dashboard |

Also linked: `accountSystemAccounts.ts`, `accountRules.ts`. Form-only helpers live under `src/features/accounts/services/` (`accountFormService`, metadata, validation) — **not** a second write path.

## Write path

```
useAccountActions / form persistence / details actions
  → named command module (createAccount, updateAccount, deleteAccount, mergeAccounts, …)
    → accountReferenceGraph (when refs must be asserted or delete-blocked)
    → AccountRepository (+ ledgerWriteService when posting opening balance)
    → auditService
```

**Do not** call `AccountRepository.create/update/delete` from feature hooks (lint-enforced).  
**Do not** revive an `AccountService` façade — [ADR-0008](adr/0008-account-mutations-via-commands.md).

## Read path

| Need | Module |
|------|--------|
| Account rows (list, by id, by type, children) | `accountQueries` via `useAccounts` / form hooks |
| Targeted single-account balance stream | `accountDerivedReads.observeAccountBalance` via `useAccountBalance` |
| Details header: account + balance + sub-accounts | `useAccountDashboard` → `ReactiveDataService.observeAccountDashboard` |
| Details metrics / unreconciled / chart | `accountDerivedReads` via details metrics/data hooks |

These are **not** parallel seams for the same job: dashboard is a composite SQL path; derived reads are targeted streams.

## Reference policy

One module owns which persisted fields reference Accounts and the policies for those refs: [ADR-0010](adr/0010-account-reference-graph.md) → `accountReferenceGraph.ts`.

## Related docs

| Doc | Role |
|-----|------|
| [CONTEXT.md](../CONTEXT.md) | Glossary |
| [ADR-0008](adr/0008-account-mutations-via-commands.md) | Commands, no AccountService; derived reads |
| [ADR-0010](adr/0010-account-reference-graph.md) | One FK inventory |
| [ACCOUNT_TRANSACTION_REPOSITORY_INTENT_INVENTORY.md](ACCOUNT_TRANSACTION_REPOSITORY_INTENT_INVENTORY.md) | Repo intent carve |
| [PROJECT_BIBLE.md](../PROJECT_BIBLE.md) | System overview |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layer map |

---

## Simplification playbook (≤15 lines)

Reuse for journal / SMS / import later:

1. Pick one domain lane and the user actions that overwhelm.  
2. Record hop count before (date + SHA) from pinned entry files.  
3. Write/update one spine doc with ≤6 layers + related-doc links.  
4. Inventory callers (`rg` + find references); collapse parallel seams; delete only if zero production callers, tests retargeted, barrels updated, verify green.  
5. Keep existing correctness spines (commands, graphs); no god façades.  
6. Stop when a stranger can onboard from the spine and hop count dropped.  
7. Next domain — do not boil the ocean.
