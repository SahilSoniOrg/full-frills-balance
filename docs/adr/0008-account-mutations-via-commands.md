# Account mutations via command modules (no AccountService façade)

We removed the broad `AccountService` lifecycle gateway. Every account state transition (create, hierarchy update, merge, balance adjust, audit-driven delete/recover) goes through named command modules under `src/services/accounts/`. System provisioning for onboarding (opening-balance and balance-correction accounts) lives in `accountSystemAccounts`, not in a generic service class.

Reactive account reads from feature hooks still use `AccountRepository` today (five hooks). Because that meets the “five or more hooks” bar, we will introduce a narrow **account read module** (`accountQueries` or equivalent) so features do not depend on the full repository surface—but we will not add mutation methods there.

Audit undo for accounts uses **lifecycle commands** (`deleteAccount`, `recoverAccount`) and **`revertAccountFromAuditState`** for UPDATE reverts—not `updateAccount` from the hierarchy command path. `audit-handlers.ts` imports command modules only.

_Avoid_: Calling `AccountService` for new code; using `AccountRepository.create/update/delete` from feature hooks (enforced by lint).
