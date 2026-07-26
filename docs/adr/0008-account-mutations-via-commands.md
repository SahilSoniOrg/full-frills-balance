# Account mutations via command modules (no AccountService façade)

We removed the broad `AccountService` lifecycle gateway. Every account state transition (create, hierarchy update, merge, balance adjust, audit-driven delete/recover) goes through named command modules under `src/services/accounts/`. System provisioning for onboarding (opening-balance and balance-correction accounts) lives in `accountSystemAccounts`, not in a generic service class.

Reactive account reads from feature hooks use **`accountQueries`** (curated observe/find API).

Audit undo for accounts uses **lifecycle commands** (`deleteAccount`, `recoverAccount`) and **`revertAccountFromAuditState`** for UPDATE reverts—not `updateAccount` from the hierarchy command path. `audit-handlers.ts` imports command modules only.

Tests import the same command modules as production; there is no `accountDomainService` delegator.

_Avoid_: Reintroducing `AccountService` or using `AccountRepository.create/update/delete` from feature hooks (enforced by lint).
