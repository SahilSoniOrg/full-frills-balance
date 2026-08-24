# Account Tree ownership

The `Account` row remains the source of truth for hierarchy. `parentAccountId`
and `orderNum` are storage fields, not a second domain entity. No Group or
Placement table is required for the current product model.

## Interface

`src/services/accounts/accountTree.ts` owns structural interpretation:

- `createAccountTreeSnapshot(accounts)` builds ordered roots by account type,
  children by parent, parent lookup, descendants, leaves, and structurally safe
  parent candidates. Direct-transaction eligibility is database state, so a
  caller can provide a transaction predicate when resolving candidates.
- `planAccountTreeMove` and `planAccountTreeBulkMove` return the complete set of
  parent/order changes needed to normalize affected sibling lists.
- `validateAccountTreeMove` enforces pure structural invariants before writes.
- `moveAccount`/`moveAccounts` in `accountHierarchyCommands.ts` are the named
  commands. `AccountTreeTransactionCoordinator` owns the Watermelon write lock
  and batch; commands return a receipt containing every affected row's before
  and expected-after structural state.
- `restoreAccountTreeMove` is the only undo path. It validates the receipt's
  expected-after state under the same lock, then restores all affected rows and
  their audit entries in one batch. A stale receipt is rejected without a
  partial restore.

Consumers should use the snapshot for repeated traversal and must not mutate
`parentAccountId` or `orderNum` through an unrelated generic update path.
The account hook exposes detail updates separately from the named `saveAccount`
form path. `saveAccount` commits details, metadata, parent placement, sibling
normalization, and audits through one account-tree transaction coordinator.

## Invariants

- Sibling order starts at zero and is contiguous within `(accountType, parent)`.
- A parent and child have the same account type.
- A move cannot create a cycle or move a deleted account. Deleted/archived
  accounts cannot receive new children.
- A parent with direct transactions cannot receive children.
- Bulk moves preserve the selected nodes' existing sibling order.
- Creation appends within the target account type + parent sibling list.
- Omitted creation positions are calculated inside the account repository's
  writer, so concurrent creates cannot choose the same sibling position.

If a future feature needs folders without account semantics or multiple saved
arrangements, revisit the schema then. That is deliberately deferred.
