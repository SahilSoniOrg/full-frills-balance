import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalListQueryRepository } from '@/src/data/repositories/journal/journalListQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { convertAmount } from '@/src/services/currencyConversion';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import type AccountModel from '@/src/data/models/Account';
import type Journal from '@/src/data/models/Journal';
import type Transaction from '@/src/data/models/Transaction';
import type { AccountId, JournalId } from '@/src/types/ids';
import type { ReportWarning } from '../types/result';
import type { ReportingFact } from '../types/fact';
import type { ReportQuery } from '../types/query';
import { classifyJournal } from '../classification/journalClassification';
import { createAccountScopePolicy } from '../policy/accountScopePolicy';
import { createJournalStatusPolicy } from '../policy/statusPolicy';

/** The reader is the only layer allowed to know WatermelonDB model details. */
export interface ReportLedgerSnapshot {
  readonly accounts: readonly AccountModel[];
  readonly actualFacts: readonly ReportingFact[];
  readonly plannedFacts: readonly ReportingFact[];
  readonly warnings: readonly ReportWarning[];
}

export function accountPathFor(
  account: AccountModel,
  byId: ReadonlyMap<string, AccountModel>,
): AccountId[] {
  const path: AccountId[] = [];
  const visited = new Set<string>();
  let current: AccountModel | undefined = account;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.id);
    current = current.parentAccountId ? byId.get(current.parentAccountId) : undefined;
  }
  return path;
}

export function selectScopedLeafAccounts(
  accounts: readonly AccountModel[],
  query: Pick<ReportQuery, 'accountIds' | 'accountTypes' | 'includeArchivedAccounts'>,
): AccountModel[] {
  const accountById = new Map(accounts.map(account => [account.id, account]));
  const parentIds = new Set(
    accounts.map(account => account.parentAccountId).filter(Boolean) as string[],
  );
  const policy = createAccountScopePolicy({
    accountIds: query.accountIds,
    accountTypes: query.accountTypes,
    includeArchivedAccounts: query.includeArchivedAccounts,
    leafAccountsOnly: true,
  });
  return accounts.filter(account =>
    policy.matches({
      id: account.id,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      accountPath: accountPathFor(account, accountById),
      isLeafAccount: !parentIds.has(account.id),
      isArchived: !!account.archivedAt,
      isDeleted: !!account.deletedAt,
    }),
  );
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function warning(
  code: ReportWarning['code'],
  severity: ReportWarning['severity'],
  message: string,
  count: number,
  ids?: { journalIds?: readonly JournalId[]; accountIds?: readonly AccountId[] },
): ReportWarning {
  return {
    code,
    severity,
    message,
    count,
    ...(ids?.journalIds ? { journalIds: ids.journalIds } : {}),
    ...(ids?.accountIds ? { accountIds: ids.accountIds } : {}),
  };
}

function classifyJournalForRows(
  journal: Journal,
  transactions: readonly Transaction[],
  accountById: ReadonlyMap<string, AccountModel>,
) {
  const accountTypes = new Map<string, AccountType>();
  const lines = transactions.map(transaction => {
    const account = accountById.get(transaction.accountId);
    if (account) accountTypes.set(transaction.accountId, account.accountType);
    return {
      accountType: account?.accountType ?? AccountType.ASSET,
      transactionType: transaction.transactionType,
      amount: transaction.amount,
    };
  });
  const transactionLike = transactions.map(transaction => ({
    accountId: transaction.accountId,
    amount: transaction.amount,
    transactionType: transaction.transactionType,
  }));
  const { source, destination } = journalPresenter.getSourceAndDestTypes(
    transactionLike,
    accountTypes,
  );
  const derivedSemantic = journalPresenter.getSemanticType(source, destination);
  const classification = classifyJournal(
    lines.map(line => ({ ...line, semanticType: derivedSemantic })),
  );
  return {
    displayType: classification.displayType ?? journal.displayType,
    semanticType: derivedSemantic,
  };
}

async function convertLine(
  transaction: Transaction,
  account: AccountModel,
  journal: Journal,
  targetCurrency: string,
) {
  const result = await convertAmount({
    amount: transaction.amount,
    fromCurrency: transaction.currencyCode || account.currencyCode || journal.currencyCode,
    toCurrency: targetCurrency,
    mode: 'historical',
    storedExchangeRate: transaction.exchangeRate,
  });
  return result.ok ? result.amount : null;
}

async function buildFacts(
  journals: readonly Journal[],
  transactions: readonly Transaction[],
  accounts: readonly AccountModel[],
  query: ReportQuery,
): Promise<{
  facts: ReportingFact[];
  missingRateJournalIds: JournalId[];
  missingAccountIds: AccountId[];
}> {
  const accountById = new Map(accounts.map(account => [account.id, account]));
  const txByJournal = new Map<string, Transaction[]>();
  transactions.forEach(transaction => {
    const rows = txByJournal.get(transaction.journalId) ?? [];
    rows.push(transaction);
    txByJournal.set(transaction.journalId, rows);
  });
  const scopedAccounts = selectScopedLeafAccounts(accounts, query);
  const allowedAccountIds = new Set(scopedAccounts.map(account => account.id));
  const parentIds = new Set(
    accounts.map(account => account.parentAccountId).filter(Boolean) as string[],
  );

  const missingRateJournalIds: JournalId[] = [];
  const missingAccountIds: AccountId[] = [];
  const facts: ReportingFact[] = [];
  for (const journal of journals) {
    const isInSelectedPeriod =
      journal.journalDate >= query.period.startDate && journal.journalDate <= query.period.endDate;
    const journalTransactions = txByJournal.get(journal.id) ?? [];
    const classification = classifyJournalForRows(journal, journalTransactions, accountById);
    const journalFacts: (ReportingFact | null)[] = await Promise.all(
      journalTransactions.map(async transaction => {
        const account = accountById.get(transaction.accountId);
        if (!account) {
          if (isInSelectedPeriod) missingAccountIds.push(transaction.accountId);
          return null;
        }
        if (!allowedAccountIds.has(account.id)) return null;
        const converted = await convertLine(transaction, account, journal, query.targetCurrency);
        if (converted === null) {
          if (isInSelectedPeriod) missingRateJournalIds.push(journal.id);
          return null;
        }
        const sign =
          account.accountType === AccountType.ASSET || account.accountType === AccountType.EXPENSE
            ? transaction.transactionType === TransactionType.DEBIT
              ? 1
              : -1
            : transaction.transactionType === TransactionType.CREDIT
              ? 1
              : -1;
        return {
          workplaceId: query.workplaceId,
          journalId: journal.id,
          transactionId: transaction.id,
          journalDate: journal.journalDate,
          journalStatus: journal.status,
          accountId: account.id,
          accountType: account.accountType,
          accountSubtype: account.accountSubtype,
          accountPath: accountPathFor(account, accountById),
          parentAccountId: account.parentAccountId,
          isLeafAccount: !parentIds.has(account.id),
          transactionType: transaction.transactionType,
          amount: transaction.amount,
          currencyCode: transaction.currencyCode,
          historicalBaseAmount: converted,
          signedBalanceDelta: converted * sign,
          journalDisplayType: classification.displayType,
          semanticType: classification.semanticType,
          description: journal.description,
          notes: transaction.notes ?? journal.notes,
          plannedPaymentId: journal.plannedPaymentId,
        } satisfies ReportingFact;
      }),
    );
    facts.push(...journalFacts.filter((fact): fact is ReportingFact => fact !== null));
  }
  return {
    facts,
    missingRateJournalIds: unique(missingRateJournalIds),
    missingAccountIds: unique(missingAccountIds),
  };
}

export async function readReportLedger(query: ReportQuery): Promise<ReportLedgerSnapshot> {
  const [accounts, actualJournals, plannedJournals, transactions] = await Promise.all([
    accountQueryRepository.findAll(query.workplaceId),
    journalListQueryRepository.findAll(query.workplaceId),
    query.basis === 'ACTUAL_PLUS_PLANNED'
      ? journalListQueryRepository.findAllPlanned(query.workplaceId)
      : Promise.resolve([]),
    transactionQueryRepository.findAllNonDeleted(query.workplaceId),
  ]);
  const actualPolicy = createJournalStatusPolicy('ACTUAL');
  const actual = actualJournals.filter(journal => actualPolicy.includes(journal.status));
  const planned = plannedJournals.filter(journal => journal.status === JournalStatus.PLANNED);
  const actualBuilt = await buildFacts(actual, transactions, accounts, query);
  const plannedBuilt =
    query.basis === 'ACTUAL_PLUS_PLANNED'
      ? await buildFacts(planned, transactions, accounts, query)
      : { facts: [], missingRateJournalIds: [], missingAccountIds: [] };
  const warnings: ReportWarning[] = [];
  const missingRateJournalIds = unique([
    ...actualBuilt.missingRateJournalIds,
    ...plannedBuilt.missingRateJournalIds,
  ]);
  const missingAccountIds = unique([
    ...actualBuilt.missingAccountIds,
    ...plannedBuilt.missingAccountIds,
  ]);
  if (missingRateJournalIds.length > 0)
    warnings.push(
      warning(
        'MISSING_EXCHANGE_RATE',
        'WARNING',
        'Some cross-currency activity was omitted because no historical rate was available.',
        missingRateJournalIds.length,
        { journalIds: missingRateJournalIds },
      ),
    );
  if (missingAccountIds.length > 0)
    warnings.push(
      warning(
        'MISSING_ACCOUNT',
        'ERROR',
        'Some transaction lines reference an account that no longer exists.',
        missingAccountIds.length,
        { accountIds: missingAccountIds },
      ),
    );
  return {
    accounts,
    actualFacts: actualBuilt.facts,
    plannedFacts: plannedBuilt.facts,
    warnings,
  };
}
