import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalListQueryRepository } from '@/src/data/repositories/journal/journalListQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AppConfig } from '@/src/constants/app-config';
import { convertAmount } from '@/src/services/currencyConversion';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { AccountType, TransactionType } from '@/src/types/enums';
import type AccountModel from '@/src/data/models/Account';
import type Journal from '@/src/data/models/Journal';
import type Transaction from '@/src/data/models/Transaction';
import type { AccountId, JournalId } from '@/src/types/ids';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { roundToPrecision } from '@/src/utils/money';
import type { ReportWarning, MissingRateQuote } from '../types/result';
import type { ReportingFact } from '../types/fact';
import type { ReportPeriod } from '../types/period';
import type { ReportQuery } from '../types/query';
import { classifyJournal } from '../classification/journalClassification';

/** The reader is the only layer allowed to know WatermelonDB model details. */
export interface ReportLedgerSnapshot {
  readonly accounts: readonly AccountModel[];
  readonly actualFacts: readonly ReportingFact[];
  readonly plannedFacts: readonly ReportingFact[];
  readonly warnings: readonly ReportWarning[];
}

export interface ReadReportLedgerOptions {
  readonly factPeriod?: ReportPeriod;
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
  return accounts.filter(account => {
    if (account.deletedAt) return false;
    if (!query.includeArchivedAccounts && account.archivedAt) return false;
    if (parentIds.has(account.id)) return false;

    const accountPath = accountPathFor(account, accountById);
    const selectedAccountIds = query.accountIds;
    if (
      selectedAccountIds !== undefined &&
      (selectedAccountIds.length === 0 ||
        !accountPath.some(accountId => selectedAccountIds.includes(accountId)))
    ) {
      return false;
    }
    if (query.accountTypes !== undefined && !query.accountTypes.includes(account.accountType)) {
      return false;
    }
    return true;
  });
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function warning(
  code: ReportWarning['code'],
  severity: ReportWarning['severity'],
  message: string,
  count: number,
  ids?: {
    journalIds?: readonly JournalId[];
    accountIds?: readonly AccountId[];
    missingRateQuotes?: readonly MissingRateQuote[];
  },
): ReportWarning {
  return {
    code,
    severity,
    message,
    count,
    ...(ids?.journalIds ? { journalIds: ids.journalIds } : {}),
    ...(ids?.accountIds ? { accountIds: ids.accountIds } : {}),
    ...(ids?.missingRateQuotes && ids.missingRateQuotes.length > 0
      ? { missingRateQuotes: ids.missingRateQuotes }
      : {}),
  };
}

function quoteKey(quote: MissingRateQuote): string {
  return `${quote.fromCurrency}:${quote.toCurrency}:${quote.rateDate}`;
}

function uniqueQuotes(quotes: readonly MissingRateQuote[]): MissingRateQuote[] {
  const byKey = new Map<string, MissingRateQuote>();
  for (const quote of quotes) byKey.set(quoteKey(quote), quote);
  return [...byKey.values()];
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
): Promise<{ ok: true; amount: number } | { ok: false; fromCurrency: string }> {
  const fromCurrency = transaction.currencyCode || account.currencyCode || journal.currencyCode;
  if (fromCurrency === targetCurrency) {
    return {
      ok: true,
      amount: roundToPrecision(transaction.amount, AppConfig.constants.precision),
    };
  }
  const result = await convertAmount({
    amount: transaction.amount,
    fromCurrency,
    toCurrency: targetCurrency,
    mode: 'historical',
    storedExchangeRate: transaction.exchangeRate,
    rateDate: journal.journalDate,
  });
  return result.ok ? { ok: true, amount: result.amount } : { ok: false, fromCurrency };
}

function toReportingFact(
  query: ReportQuery,
  journal: Journal,
  transaction: Transaction,
  account: AccountModel,
  converted: number,
  classification: ReturnType<typeof classifyJournalForRows>,
  parentIds: ReadonlySet<string>,
  accountById: ReadonlyMap<string, AccountModel>,
): ReportingFact {
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
    accountName: account.name,
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
  };
}

async function buildFacts(
  journals: readonly Journal[],
  transactions: readonly Transaction[],
  accounts: readonly AccountModel[],
  query: ReportQuery,
): Promise<{
  facts: ReportingFact[];
  missingRateJournalIds: JournalId[];
  missingRateQuotes: MissingRateQuote[];
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
  const missingRateQuotes: MissingRateQuote[] = [];
  const missingAccountIds: AccountId[] = [];
  const orderedFacts: (ReportingFact | undefined)[] = [];
  const conversionJobs: {
    slot: number;
    journal: Journal;
    transaction: Transaction;
    account: AccountModel;
    classification: ReturnType<typeof classifyJournalForRows>;
    isInSelectedPeriod: boolean;
  }[] = [];

  for (const journal of journals) {
    const isInSelectedPeriod =
      journal.journalDate >= query.period.startDate && journal.journalDate <= query.period.endDate;
    const journalTransactions = txByJournal.get(journal.id) ?? [];
    const classification = classifyJournalForRows(journal, journalTransactions, accountById);
    for (const transaction of journalTransactions) {
      const account = accountById.get(transaction.accountId);
      if (!account) {
        if (isInSelectedPeriod) missingAccountIds.push(transaction.accountId);
        continue;
      }
      if (!allowedAccountIds.has(account.id)) continue;
      const slot = orderedFacts.length;
      orderedFacts.push(undefined);
      conversionJobs.push({
        slot,
        journal,
        transaction,
        account,
        classification,
        isInSelectedPeriod,
      });
    }
  }
  await runTasksWithBoundedConcurrency(
    conversionJobs,
    AppConfig.performance.maxConcurrentOperations,
    async job => {
      const converted = await convertLine(
        job.transaction,
        job.account,
        job.journal,
        query.targetCurrency,
      );
      if (!converted.ok) {
        if (job.isInSelectedPeriod) {
          missingRateJournalIds.push(job.journal.id);
          if (converted.fromCurrency) {
            missingRateQuotes.push({
              fromCurrency: converted.fromCurrency.trim().toUpperCase(),
              toCurrency: query.targetCurrency.trim().toUpperCase(),
              rateDate: job.journal.journalDate,
            });
          }
        }
        return;
      }
      orderedFacts[job.slot] = toReportingFact(
        query,
        job.journal,
        job.transaction,
        job.account,
        converted.amount,
        job.classification,
        parentIds,
        accountById,
      );
    },
  );
  return {
    facts: orderedFacts.filter((fact): fact is ReportingFact => fact !== undefined),
    missingRateJournalIds: unique(missingRateJournalIds),
    missingRateQuotes: uniqueQuotes(missingRateQuotes),
    missingAccountIds: unique(missingAccountIds),
  };
}

export async function readReportLedger(
  query: ReportQuery,
  options: ReadReportLedgerOptions = {},
): Promise<ReportLedgerSnapshot> {
  const factPeriod = options.factPeriod ?? query.period;
  const [accounts, actual, planned] = await Promise.all([
    accountQueryRepository.findAll(query.workplaceId),
    journalListQueryRepository.findPostedInDateRange(
      query.workplaceId,
      factPeriod.startDate,
      factPeriod.endDate,
    ),
    query.basis === 'ACTUAL_PLUS_PLANNED'
      ? journalListQueryRepository.findPlannedInDateRange(
          query.workplaceId,
          factPeriod.startDate,
          factPeriod.endDate,
        )
      : Promise.resolve([] as Journal[]),
  ]);
  const journalIds = [...actual, ...planned].map(journal => journal.id);
  const transactions = await transactionQueryRepository.findByJournals(
    query.workplaceId,
    journalIds,
  );
  const actualBuilt = await buildFacts(actual, transactions, accounts, query);
  const plannedBuilt =
    query.basis === 'ACTUAL_PLUS_PLANNED'
      ? await buildFacts(planned, transactions, accounts, query)
      : { facts: [], missingRateJournalIds: [], missingRateQuotes: [], missingAccountIds: [] };
  const warnings: ReportWarning[] = [];
  const missingRateJournalIds = unique([
    ...actualBuilt.missingRateJournalIds,
    ...plannedBuilt.missingRateJournalIds,
  ]);
  const missingRateQuotes = uniqueQuotes([
    ...actualBuilt.missingRateQuotes,
    ...plannedBuilt.missingRateQuotes,
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
        { journalIds: missingRateJournalIds, missingRateQuotes },
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
