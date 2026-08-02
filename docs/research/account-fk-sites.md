# Account FK sites inventory (research #20)

> **Baseline:** `c95db00bd872629fc6e5146b299ada8db5c15ff8`  
> **Branch:** `research/account-fk-sites`  
> **Scope:** Facts only — which persisted fields reference Accounts today, cardinality, and which current modules already know about each site. No policy decisions.

Related: map [#19](https://github.com/SahilSoniOrg/full-frills-balance/issues/19), `CONTEXT.md` (**Account reference graph**).

## Method

Cross-checked primary walkers and writers against schema/models:

| Module | Path | Role |
| --- | --- | --- |
| Schema | `src/data/database/schema.ts` | Column truth |
| Models | `src/data/models/*.ts` | Field → column mapping |
| Delete blockers | `src/services/accounts/accountDeleteBlockers.ts` | Soft-delete FK inventory (partial) |
| Delete command | `src/services/accounts/accountDeleteCommands.ts` | Journal-leg gate before blockers |
| Import collect + remap | `src/services/import/plugins/nativeImportAccountRemap.ts`, `native-plugin.ts` | Orphan recovery set + ID rewrite |
| Import validate | `src/services/import/validateImportedData.ts` | Structural FK checks |
| Merge orchestrator | `src/services/accounts/accountMergeCommands.ts` | Which prepareMerge ops run |
| Merge ops | `AccountMergeOperations`, `budgetWriteService`, `plannedPaymentMergeOperations`, `TransactionAutoPostRuleRepository`, `BalanceSnapshotRepository`, inline tx remap | Per-site rewrite/destroy |
| Assert | `src/services/accounts/assertAccountsExist.ts` + call sites | Write-path existence |

## Summary table (WatermelonDB Account-referencing fields)

| # | Entity / table | Field path (model → column) | Cardinality | validateImportedData | nativeImport collect / remap | accountDeleteBlockers / deleteAccount | merge | assertAccountsExist (or equivalent) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `Account` / `accounts` | `parentAccountId` → `parent_account_id` | scalar | yes | collect + remap | blockers: children via `queryByParentId` | retarget children → target | **not** via assert; `accountRepository.find` + hierarchy rules in create/update |
| 2 | `Transaction` / `transactions` | `accountId` → `account_id` | scalar | yes (skips soft-deleted txs) | collect + remap | **not** in blockers; `deleteAccount` uses `transactionRepository.hasTransactions` | retarget → target | `prepareJournalData` |
| 3 | `BudgetScope` / `budget_scopes` | `accountId` → `account_id` | scalar | yes | collect + remap | blockers: `findAllScopesByAccountIds` | retarget → target | `budgetWriteService` create/update (scope `accountIds`) |
| 4 | `Budget` / `budgets` | `assetAccountIds` → `asset_account_ids` | **CSV** | yes (split/trim) | collect (split) + remap (join) | blockers: `findAllReferencingAssetAccountId` + CSV filter | rewrite CSV ids → target, dedupe | `budgetWriteService` create/update (`data.assetAccountIds`) |
| 5 | `AccountMetadata` / `account_metadata` | `accountId` → `account_id` | scalar | yes | collect + remap | **no** (row owned by the account being deleted) | **does not** retarget owner `account_id` on merge | n/a on write of metadata owner (created with account) |
| 6 | `AccountMetadata` / `account_metadata` | `payFromAccountId` → `pay_from_account_id` | scalar | yes | collect + remap | blockers: `findMetadataByPayFromAccountIds` | retarget → target | `accountCommands` / `accountHierarchyCommands` |
| 7 | `PlannedPayment` / `planned_payments` | `fromAccountId` → `from_account_id` | scalar | yes | collect + remap | blockers: `findAllByFromAccountIds` | retarget → target | `plannedPaymentCommands` create/update |
| 8 | `PlannedPayment` / `planned_payments` | `toAccountId` → `to_account_id` | scalar | yes | collect + remap | blockers: `findAllByToAccountIds` | retarget → target | `plannedPaymentCommands` create/update |
| 9 | `BalanceSnapshot` / `balance_snapshots` | `accountId` → `account_id` | scalar | yes | collect + remap | **no** | **destroy** snapshots for source+target ids (not retarget) | none found |
| 10 | `TransactionAutoPostRule` / `transaction_auto_post_rules` | `sourceAccountId` → `source_account_id` (+ mirror in `actionsJson`) | **dual** | yes (columns) | **not** in collect; remap sanitizes missing → `EMPTY_ACCOUNT_ID` + sync JSON | blockers: `findAllReferencingAccountIds` (columns) | retarget columns + `syncRuleActionsFromColumns` | `SmsRuleEngine` save |
| 11 | `TransactionAutoPostRule` / `transaction_auto_post_rules` | `categoryAccountId` → `category_account_id` (+ mirror in `actionsJson`) | **dual** | yes (columns) | same as #10 | same as #10 | same as #10 | same as #10 |

**Site count (WDB Account FK fields):** **11**

Dual (#10/#11): columns are treated as canonical; `actions_json` mirrors account ids via `syncRuleActionsFromColumns` (`src/services/sms/ruleActionsAccountIds.ts`). Map #19 Notes call SMS column/`actionsJson` deepening a separate seam — inventory still records dual storage as it exists today.

---

## Per-site evidence

### 1. `Account.parentAccountId` — scalar

- Schema: `src/data/database/schema.ts` L13 (`parent_account_id`).
- Model: `src/data/models/Account.ts` L181.
- **validate:** `validateImportedData.ts` L37–62 (missing parent, self-parent, cycle walk).
- **import collect:** `nativeImportAccountRemap.ts` L48–50.
- **import remap:** `native-plugin.ts` L205 (`accountMap.get(parentAccountId)`).
- **delete blockers:** children via `accountRepository.queryByParentId` — `accountDeleteBlockers.ts` L24, L41.
- **merge:** `AccountMergeOperations.ts` L33–38, L58–62 (children’s `parentAccountId` → target).
- **assert / write:** create uses `accountRepository.find` for parent (`accountCommands.ts` L34–40), not `assertAccountsExistInWorkplace`. Update: find + circular checks (`accountHierarchyCommands.ts` L90–105). Assert is used for pay-from only on those paths.

### 2. `Transaction.accountId` — scalar (journal legs)

- Schema: `schema.ts` L102; model `Transaction.ts` L21.
- **validate:** `validateImportedData.ts` L64–76 (non-deleted txs only).
- **import collect:** `nativeImportAccountRemap.ts` L51–53.
- **import remap:** `native-plugin.ts` L242–246 (`requireMappedAccountId`).
- **delete:** **not** in `collectAccountDeleteBlockers`. Separate gate in `accountDeleteCommands.ts` L21–26 via `transactionRepository.hasTransactions`.
- **merge:** `accountMergeCommands.ts` L78–89 (inline `prepareUpdate` retarget); also `TransactionService.prepareMergeOperations` exists (`TransactionService.ts` L228+) but merge command uses repository fetch inline.
- **assert:** `prepareJournalData.ts` L36–40.

### 3. `BudgetScope.accountId` — scalar

- Schema: `schema.ts` L198; model `BudgetScope.ts` L22.
- **validate:** `validateImportedData.ts` L78–88.
- **import collect / remap:** `nativeImportAccountRemap.ts` L54–56; `native-plugin.ts` L312–319.
- **delete blockers:** `accountDeleteBlockers.ts` L25, L42 via `budgetRepository.findAllScopesByAccountIds`.
- **merge:** `budgetWriteService.ts` L82–89.
- **assert:** `budgetWriteService.ts` L17–20, L44–47 (scope ids in `accountIds`).

### 4. `Budget.assetAccountIds` — CSV

- Schema: `schema.ts` L182; model `Budget.ts` L23 (string).
- Repository write joins arrays: `BudgetRepository.ts` L103, L151–152.
- **validate:** `validateImportedData.ts` L91–101 (`split(',')` + trim).
- **import collect:** `nativeImportAccountRemap.ts` L68–72.
- **import remap:** `native-plugin.ts` L284–307.
- **delete blockers:** `accountDeleteBlockers.ts` L26, L33–38, L43–45 (`findAllReferencingAssetAccountId` + CSV membership filter). Query helper: `BudgetRepository.ts` L209–218 (`LIKE`).
- **merge:** `budgetWriteService.ts` L92–114 (split/map/dedupe/join).
- **assert:** `budgetWriteService.ts` L17–20, L44–47 (`data.assetAccountIds` array form).

### 5. `AccountMetadata.accountId` — scalar (owner)

- Schema: `schema.ts` L215; model `AccountMetadata.ts` L14.
- **validate:** `validateImportedData.ts` L104–108.
- **import collect / remap:** `nativeImportAccountRemap.ts` L57–58; `native-plugin.ts` L323–329.
- **delete blockers:** not listed (metadata belongs to deleted account).
- **merge:** `AccountMergeOperations.ts` L29–31 loads source metadata; update path L90–96 only rewrites `payFromAccountId` when set — **owner `accountId` is not retargeted** to the merge target.
- **assert:** none as a cross-account FK on write.

### 6. `AccountMetadata.payFromAccountId` — scalar

- Schema: `schema.ts` L226; model `AccountMetadata.ts` L26.
- **validate:** `validateImportedData.ts` L110–114.
- **import collect / remap:** `nativeImportAccountRemap.ts` L59; `native-plugin.ts` L340–346.
- **delete blockers:** `accountDeleteBlockers.ts` L29, L50–52 via `findMetadataByPayFromAccountIds` (`AccountRepository.ts` L238–248).
- **merge:** `AccountMergeOperations.ts` L22–27, L51–56, L90–96.
- **assert:** `accountCommands.ts` L47–52; `accountHierarchyCommands.ts` L128–133.

### 7–8. `PlannedPayment.fromAccountId` / `toAccountId` — scalar

- Schema: `schema.ts` L250–251; model `PlannedPayment.ts` L31–32. Schema marks `to_account_id` optional; validate/import treat both as required account refs.
- **validate:** `validateImportedData.ts` L117–122.
- **import collect / remap:** `nativeImportAccountRemap.ts` L61–63; `native-plugin.ts` L353–368.
- **delete blockers:** `accountDeleteBlockers.ts` L27–28, L46–48.
- **merge:** `plannedPaymentMergeOperations.ts` L13–47 (via `plannedPaymentService.prepareMergeOperations`).
- **assert:** `plannedPaymentCommands.ts` L16–20, L37–41.

### 9. `BalanceSnapshot.accountId` — scalar

- Schema: `schema.ts` L35; model `BalanceSnapshot.ts` L13.
- **validate:** `validateImportedData.ts` L133–138.
- **import collect / remap:** `nativeImportAccountRemap.ts` L65–66; `native-plugin.ts` L436+ (`requireMappedAccountId`).
- **delete blockers:** **absent** (delete allowed w.r.t. snapshots today).
- **merge:** `BalanceSnapshotRepository.prepareMergeOperations` L151–158 — **permanent destroy** for given account ids; merge command passes source **and** target (`accountMergeCommands.ts` L103–106).
- **assert:** none found.

### 10–11. SMS auto-post `sourceAccountId` / `categoryAccountId` — dual

- Schema columns: `schema.ts` L306–307; also `actions_json` L304.
- Model: `TransactionAutoPostRule.ts` L17–20.
- Dual helper: `ruleActionsAccountIds.ts` L41–64 (“Columns are canonical…”).
- **validate:** columns only — `validateImportedData.ts` L141–152 (empty/`EMPTY_ACCOUNT_ID` allowed).
- **import collect:** explicitly **excluded** from orphan recovery — `nativeImportAccountRemap.ts` L74–75 comment; `collectReferencedAccountIds` does not walk rules.
- **import remap:** `remapAutoPostRulesForImport` L133–170 — `mapOptionalRuleAccountId` clears missing; syncs `actionsJson`.
- **delete blockers:** column query only — `TransactionAutoPostRuleRepository.findAllReferencingAccountIds` L116–139; used in `accountDeleteBlockers.ts` L30, L53.
- **merge:** repository `prepareMergeOperations` L142–162 (columns + `syncRuleActionsFromColumns`).
- **assert:** `SmsRuleEngine.ts` L346–350.

---

## Module coverage matrix (who already inventories which sites)

Legend: ✓ known / walked · ✗ not known by this module · ~ adjacent / partial

| Site | validateImportedData | collectReferencedAccountIds | delete blockers | deleteAccount (tx gate) | merge rewrite/destroy | assert* |
| --- | --- | --- | --- | --- | --- | --- |
| parent | ✓ | ✓ | ✓ (as children) | | ✓ | ~ find |
| tx leg | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| budget scope | ✓ | ✓ | ✓ | | ✓ | ✓ |
| asset CSV | ✓ | ✓ | ✓ | | ✓ | ✓ |
| metadata owner | ✓ | ✓ | ✗ | | ✗ retarget | ✗ |
| pay-from | ✓ | ✓ | ✓ | | ✓ | ✓ |
| PP from/to | ✓ | ✓ | ✓ | | ✓ | ✓ |
| snapshot | ✓ | ✓ | ✗ | | ✓ destroy | ✗ |
| SMS source/cat | ✓ columns | ✗ (sanitize path) | ✓ columns | | ✓ dual | ✓ |

\*assert = `assertAccountsExistInWorkplace` unless noted.

**Fact:** today there is **no single module** that lists all 11 sites; inventories are parallel (CONTEXT.md already names this smell).

---

## Assert call sites (complete)

| Caller | IDs passed | File |
| --- | --- | --- |
| `budgetWriteService` create/update | scope ids + `assetAccountIds` | `src/services/budget/budgetWriteService.ts` L17–20, L44–47 |
| `plannedPaymentCommands` create/update | from + to | `src/services/planned-payment/plannedPaymentCommands.ts` L16–20, L37–41 |
| `accountCommands` create | `metadata.payFromAccountId` | `src/services/accounts/accountCommands.ts` L47–52 |
| `accountHierarchyCommands` update | `metadata.payFromAccountId` | `src/services/accounts/accountHierarchyCommands.ts` L128–133 |
| `prepareJournalData` | journal leg account ids | `src/services/ledger/prepareJournalData.ts` L36–40 |
| `SmsRuleEngine` save | source + category | `src/services/sms/SmsRuleEngine.ts` L346–350 |
| `accountAdjustCommands` | counterparty account id | `src/services/accounts/accountAdjustCommands.ts` L49–53 |

Parent existence uses repository `find` + domain rules, not this helper (`accountCommands.ts` L34–40; `accountHierarchyCommands.ts` L90–105).

---

## Merge orchestration (site list as coded)

`mergeAccounts` batches (`accountMergeCommands.ts` L76–116):

1. Transactions → retarget `accountId`
2. Planned payments → `preparePlannedPaymentMergeOperations`
3. SMS rules → `transactionAutoPostRuleRepository.prepareMergeOperations`
4. Budgets → scopes + CSV via `budgetWriteService.prepareMergeOperations`
5. Accounts/metadata → `accountRepository.prepareMergeOperations` → `AccountMergeOperations` (parent + pay-from; soft-delete sources)
6. Balance snapshots → destroy for `[...sources, target]`

---

## Peripheral persisted Account ids (outside WDB FK inventory)

Not WatermelonDB columns; **none** of the primary walkers above include them:

| Store | Fields | Notes |
| --- | --- | --- |
| UI preferences | `lastSelectedAccountId`, `lastUsedSourceAccountId`, `lastUsedDestinationAccountId` | `src/utils/preferences/types.ts` L9, L17–18; restored on import without account remap (`ImportService.ts` L207–212). |
| Audit log | `entityId` when `entityType === 'account'` | Remapped in `native-plugin.ts` L264–267; not a delete/merge FK walker site. |
| Inbox | `parsed_account_source` | String label, not `AccountId` (`schema.ts` L335). |

---

## Non-claims (out of this ticket)

- No policy recommendations (delete block vs allow, salvage vs sanitize) — locked on map #19 Notes.
- Does not implement `src/services/accounts/` reference-graph module.
- Does not resolve sibling research tickets #21–#23.
