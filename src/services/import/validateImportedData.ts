import type {
  BatchImportData,
  CanonicalAccount,
  CanonicalAccountMatcher,
  CanonicalOpenItem,
  CanonicalPersonAccount,
} from '@/src/types/importContracts';
import {
  formatMissingImportedAccountError,
  missingImportedAccountRefs,
} from '@/src/services/accounts/accountReferenceGraph';
import { accountImportBatchFromSources } from '@/src/services/import/plugins/nativeImportAccountRemap';
import {
  conditionsKeyFor,
  parseStoredMatcherDefinition,
  validateAccountMatcherDefinition,
} from '@/src/services/sms/recognition/accountMatcherDefinition';
import { AccountSubtype, AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { classifyPersonDebtPosting, isCompatiblePersonAccount } from '@/src/domain/people';
import { isRepaymentJournal } from '@/src/domain/people/personRepaymentPolicy';

function assertUniqueIds(tableName: string, records: { id: string }[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`Import validation failed: duplicate ${tableName} id "${record.id}"`);
    }
    seen.add(record.id);
  }
}

function validateAccountReferences(data: BatchImportData): void {
  // Soft-deleted txs are skipped inside accountImportBatchFromSources (import-only rule).
  const missing = missingImportedAccountRefs(accountImportBatchFromSources(data));
  if (missing.length > 0) {
    throw new Error(formatMissingImportedAccountError(missing[0]));
  }
}

function validateStructuralRules(data: BatchImportData): void {
  assertUniqueIds('account', data.accounts);
  assertUniqueIds('journal', data.journals);
  assertUniqueIds('transaction', data.transactions);
  assertUniqueIds('budget', data.budgets ?? []);
  assertUniqueIds('budget scope', data.budgetScopes ?? []);
  assertUniqueIds('planned payment', data.plannedPayments ?? []);
  assertUniqueIds('journal metadata', data.journalMetadata ?? []);
  assertUniqueIds('balance snapshot', data.balanceSnapshots ?? []);
  assertUniqueIds('transaction inbox record', data.transactionInboxRecords ?? []);
  assertUniqueIds('account matcher', data.accountMatchers ?? []);
  assertUniqueIds('currency', data.currencies ?? []);
  assertUniqueIds('person', data.people ?? []);
  assertUniqueIds('person account', data.personAccounts ?? []);
  assertUniqueIds('open item', data.openItems ?? []);
  assertUniqueIds('settlement allocation', data.settlementAllocations ?? []);

  const journalIds = new Set(data.journals.map(journal => journal.id));
  const transactionIds = new Set(data.transactions.map(transaction => transaction.id));
  const budgetIds = new Set((data.budgets ?? []).map(budget => budget.id));
  const plannedPaymentIds = new Set(
    (data.plannedPayments ?? []).map(plannedPayment => plannedPayment.id),
  );
  const currencyCodes = new Set((data.currencies ?? []).map(currency => currency.code));
  const people = new Set((data.people ?? []).map(person => person.id));
  const accounts = new Set(data.accounts.map(account => account.id));
  const activePersonAccounts = new Set<string>();
  const activeLinksByAccount = new Map<string, CanonicalPersonAccount[]>();
  const accountById = new Map(data.accounts.map(account => [account.id, account] as const));
  const personById = new Map((data.people ?? []).map(person => [person.id, person] as const));
  for (const row of data.personAccounts ?? []) {
    if (row.deletedAt != null) continue;
    if (!people.has(row.personId) || !accounts.has(row.accountId))
      throw new Error(
        `Import validation failed: person account "${row.id}" references a missing person or account`,
      );
    const key = row.accountId;
    if (activePersonAccounts.has(key))
      throw new Error(
        `Import validation failed: account "${key}" is linked to multiple active people`,
      );
    activePersonAccounts.add(key);
    activeLinksByAccount.set(key, [...(activeLinksByAccount.get(key) ?? []), row]);
    const account = accountById.get(row.accountId)!;
    if (account.deletedAt != null) {
      throw new Error(
        `Import validation failed: active People account link "${row.id}" targets a deleted account`,
      );
    }
    if (
      data.accounts.some(
        candidate => candidate.deletedAt == null && candidate.parentAccountId === row.accountId,
      )
    ) {
      throw new Error(
        `Import validation failed: People account "${row.accountId}" must be a leaf account`,
      );
    }
    if (
      !isCompatiblePersonAccount({
        id: row.accountId,
        type: account.accountType as AccountType,
        subtype: (account.accountSubtype ?? AccountSubtype.OTHER) as AccountSubtype,
        currencyCode: account.currencyCode,
      })
    ) {
      throw new Error(
        `Import validation failed: People account "${row.accountId}" has an unsupported account role`,
      );
    }
    if (personById.get(row.personId)?.deletedAt != null) {
      throw new Error(
        `Import validation failed: active People account link "${row.id}" belongs to a deleted person`,
      );
    }
  }
  const precisionByCurrency = new Map(
    (data.currencies ?? []).map(currency => [currency.code, currency.precision]),
  );
  const openItems = new Set((data.openItems ?? []).map(row => row.id));
  const liveItems = new Map<string, CanonicalOpenItem>();
  const journalById = new Map(data.journals.map(journal => [journal.id, journal]));
  const trackedPostings = new Set<string>();
  const transactionsByPosting = new Map<string, typeof data.transactions>();
  for (const transaction of data.transactions) {
    if (transaction.deletedAt != null) continue;
    const key = JSON.stringify([transaction.journalId, transaction.accountId]);
    const rows = transactionsByPosting.get(key) ?? [];
    rows.push(transaction);
    transactionsByPosting.set(key, rows);
  }
  for (const row of data.openItems ?? []) {
    if (row.deletedAt != null) continue;
    if (
      !people.has(row.personId) ||
      !accounts.has(row.accountId) ||
      !journalIds.has(row.originatingJournalId)
    )
      throw new Error(
        `Import validation failed: open item "${row.id}" references a missing person, account, or journal`,
      );
    const account = accountById.get(row.accountId)!;
    const expectedType = row.direction === 'receivable' ? AccountType.ASSET : AccountType.LIABILITY;
    if (account.accountType !== expectedType || account.currencyCode !== row.currencyCode) {
      throw new Error(
        `Import validation failed: open item "${row.id}" does not match its linked account role and currency`,
      );
    }
    if (currencyCodes.size > 0 && !currencyCodes.has(row.currencyCode)) {
      throw new Error(
        `Import validation failed: open item "${row.id}" references missing currency "${row.currencyCode}"`,
      );
    }
    if (
      !(activeLinksByAccount.get(row.accountId) ?? []).some(link => link.personId === row.personId)
    ) {
      throw new Error(
        `Import validation failed: open item "${row.id}" has no active People account link`,
      );
    }
    const precision =
      precisionByCurrency.get(row.currencyCode) ?? getCurrencyPrecision(row.currencyCode);
    if (
      !Number.isFinite(row.originalAmount) ||
      row.originalAmount <= 0 ||
      Math.abs(
        fromMinorUnits(toMinorUnits(row.originalAmount, precision), precision) - row.originalAmount,
      ) > 1e-8
    ) {
      throw new Error(`Import validation failed: open item "${row.id}" has an invalid amount`);
    }
    const origin = journalById.get(row.originatingJournalId);
    const postingKey = JSON.stringify([row.originatingJournalId, row.accountId]);
    const postings = (transactionsByPosting.get(postingKey) ?? []).filter(
      transaction =>
        (transaction.transactionType === TransactionType.DEBIT ||
          transaction.transactionType === TransactionType.CREDIT) &&
        classifyPersonDebtPosting({
          accountType: account.accountType as AccountType,
          transactionType: transaction.transactionType,
        }) === 'increasing',
    );
    if (
      !origin ||
      origin.deletedAt != null ||
      origin.status !== JournalStatus.POSTED ||
      trackedPostings.has(postingKey) ||
      postings.length !== 1 ||
      toMinorUnits(postings[0].amount, precision) !== toMinorUnits(row.originalAmount, precision)
    ) {
      throw new Error(
        `Import validation failed: open item "${row.id}" has no matching posted debt`,
      );
    }
    trackedPostings.add(postingKey);
    liveItems.set(row.id, row);
  }
  const allocatedByItem = new Map<string, number>();
  const allocatedByPosting = new Map<string, number>();
  const reducingByPosting = new Map<string, number>();
  for (const transaction of data.transactions) {
    if (transaction.deletedAt != null) continue;
    const account = accountById.get(transaction.accountId);
    if (
      !account ||
      (transaction.transactionType !== TransactionType.DEBIT &&
        transaction.transactionType !== TransactionType.CREDIT)
    )
      continue;
    if (
      classifyPersonDebtPosting({
        accountType: account.accountType as AccountType,
        transactionType: transaction.transactionType,
      }) !== 'reducing'
    )
      continue;
    const digits =
      precisionByCurrency.get(account.currencyCode) ?? getCurrencyPrecision(account.currencyCode);
    const key = JSON.stringify([transaction.journalId, transaction.accountId]);
    reducingByPosting.set(
      key,
      (reducingByPosting.get(key) ?? 0) + toMinorUnits(transaction.amount, digits),
    );
  }
  for (const row of data.settlementAllocations ?? []) {
    if (row.deletedAt != null || !row.isActive) continue;
    const item = liveItems.get(row.openItemId);
    if (
      !people.has(row.personId) ||
      !openItems.has(row.openItemId) ||
      !accounts.has(row.accountId) ||
      !journalIds.has(row.settlementJournalId)
    )
      throw new Error(
        `Import validation failed: settlement allocation "${row.id}" references a missing person, open item, account, or journal`,
      );
    if (!item || item.personId !== row.personId || item.accountId !== row.accountId) {
      throw new Error(
        `Import validation failed: settlement allocation "${row.id}" does not match its open item`,
      );
    }
    const journal = journalById.get(row.settlementJournalId);
    if (
      !journal ||
      journal.deletedAt != null ||
      journal.status !== JournalStatus.POSTED ||
      (row.allocationKind === 'repayment' && !isRepaymentJournal(journal))
    ) {
      throw new Error(
        `Import validation failed: settlement allocation "${row.id}" has an unavailable journal`,
      );
    }
    const precision =
      precisionByCurrency.get(item.currencyCode) ?? getCurrencyPrecision(item.currencyCode);
    const amount = toMinorUnits(row.amount, precision);
    if (
      !Number.isInteger(amount) ||
      amount <= 0 ||
      Math.abs(fromMinorUnits(amount, precision) - row.amount) > 1e-8
    ) {
      throw new Error(
        `Import validation failed: settlement allocation "${row.id}" has an invalid amount`,
      );
    }
    const total = (allocatedByItem.get(item.id) ?? 0) + amount;
    if (total > toMinorUnits(item.originalAmount, precision)) {
      throw new Error(
        `Import validation failed: settlement allocations exceed open item "${item.id}"`,
      );
    }
    allocatedByItem.set(item.id, total);
    const postingKey = JSON.stringify([row.settlementJournalId, row.accountId]);
    const postingTotal = (allocatedByPosting.get(postingKey) ?? 0) + amount;
    if (postingTotal > (reducingByPosting.get(postingKey) ?? 0)) {
      throw new Error(
        `Import validation failed: settlement allocations exceed journal posting for "${row.settlementJournalId}"`,
      );
    }
    allocatedByPosting.set(postingKey, postingTotal);
  }

  for (const matcher of data.accountMatchers ?? []) validateAccountMatcher(matcher);

  for (const account of data.accounts) {
    if (account.parentAccountId && account.parentAccountId === account.id) {
      throw new Error(`Import validation failed: account "${account.id}" cannot be its own parent`);
    }
  }

  // Detect parent cycles before persistence. A self-reference is handled above;
  // this catches longer cycles such as A → B → C → A.
  for (const account of data.accounts) {
    const visited = new Set<string>();
    let current: CanonicalAccount | undefined = account;
    while (current?.parentAccountId) {
      if (visited.has(current.id)) {
        throw new Error(
          `Import validation failed: account hierarchy contains a cycle involving "${current.id}"`,
        );
      }
      visited.add(current.id);
      current = data.accounts.find(candidate => candidate.id === current?.parentAccountId);
    }
  }

  for (const transaction of data.transactions) {
    if (transaction.deletedAt != null) continue;
    if (!journalIds.has(transaction.journalId)) {
      throw new Error(
        `Import validation failed: transaction "${transaction.id}" references missing journal "${transaction.journalId}"`,
      );
    }
  }

  for (const budgetScope of data.budgetScopes ?? []) {
    if (!budgetIds.has(budgetScope.budgetId)) {
      throw new Error(
        `Import validation failed: budget scope "${budgetScope.id}" references missing budget "${budgetScope.budgetId}"`,
      );
    }
  }

  for (const snapshot of data.balanceSnapshots ?? []) {
    if (!transactionIds.has(snapshot.transactionId)) {
      throw new Error(
        `Import validation failed: balance snapshot "${snapshot.id}" references a missing account or transaction`,
      );
    }
  }

  for (const metadata of data.journalMetadata ?? []) {
    if (!journalIds.has(metadata.journalId)) {
      throw new Error(
        `Import validation failed: journal metadata "${metadata.id}" references missing journal "${metadata.journalId}"`,
      );
    }
  }

  for (const inboxRecord of data.transactionInboxRecords ?? []) {
    if (inboxRecord.linkedJournalId && !journalIds.has(inboxRecord.linkedJournalId)) {
      throw new Error(
        `Import validation failed: inbox record "${inboxRecord.id}" references missing journal "${inboxRecord.linkedJournalId}"`,
      );
    }
    if (inboxRecord.duplicateJournalId && !journalIds.has(inboxRecord.duplicateJournalId)) {
      throw new Error(
        `Import validation failed: inbox record "${inboxRecord.id}" references missing duplicate journal "${inboxRecord.duplicateJournalId}"`,
      );
    }
  }

  if (currencyCodes.size > 0) {
    for (const transaction of data.transactions) {
      if (!currencyCodes.has(transaction.currencyCode)) {
        throw new Error(
          `Import validation failed: transaction "${transaction.id}" references missing currency "${transaction.currencyCode}"`,
        );
      }
    }
    for (const journal of data.journals) {
      if (!currencyCodes.has(journal.currencyCode)) {
        throw new Error(
          `Import validation failed: journal "${journal.id}" references missing currency "${journal.currencyCode}"`,
        );
      }
    }
  }

  for (const journal of data.journals) {
    if (journal.plannedPaymentId && !plannedPaymentIds.has(journal.plannedPaymentId)) {
      throw new Error(
        `Import validation failed: journal "${journal.id}" references missing planned payment "${journal.plannedPaymentId}"`,
      );
    }
  }
}

function validateAccountMatcher(matcher: CanonicalAccountMatcher): void {
  const result = validateAccountMatcherDefinition(
    parseStoredMatcherDefinition(matcher.definitionJson),
  );
  if (!result.valid || !result.definition) {
    throw new Error(
      `Import validation failed: account matcher "${matcher.id}" has invalid definition`,
    );
  }
  if (conditionsKeyFor(result.definition) !== matcher.conditionsKey) {
    throw new Error(
      `Import validation failed: account matcher "${matcher.id}" has an invalid conditions key`,
    );
  }
  if (typeof matcher.isEnabled !== 'boolean') {
    throw new Error(
      `Import validation failed: account matcher "${matcher.id}" has invalid enabled state`,
    );
  }
}

/**
 * Ensures imported graphs hang together (IDs, FKs, hierarchy).
 * Account FK presence walks the shared Account reference graph inventory;
 * import-only structural rules (cycles, empty review legs, soft-deleted tx skip)
 * stay local in this adapter.
 * Historical journal amounts and FX calculations are trusted as written.
 */
export function validateImportedData(data: BatchImportData): void {
  validateStructuralRules(data);
  validateAccountReferences(data);
}
