import type Journal from '@/src/data/models/Journal';
import type Transaction from '@/src/data/models/Transaction';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { JournalStatus, type TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { journalQueryRepository } from './journalQueryRepository';

export interface JournalBalanceSourceLine {
  id: string;
  accountId: AccountId;
  accountName?: string;
  /** Undefined when the account is missing or deleted. */
  accountCurrency?: string;
  /** Currency stored on the line itself. */
  currencyCode: string;
  amount: number;
  exchangeRate?: number;
  transactionType: TransactionType;
  notes?: string;
}

/** A posted journal with everything needed to re-evaluate, display, and rewrite its lines. */
export interface JournalBalanceSource {
  journalId: JournalId;
  description?: string;
  journalDate: number;
  currencyCode: string;
  lines: JournalBalanceSourceLine[];
}

interface RawJournalBalanceRow {
  journalId: JournalId;
  journalCurrency: string;
  description: string | null;
  journalDate: number;
  transactionId: string | null;
  accountId: AccountId | null;
  accountName: string | null;
  accountCurrency: string | null;
  lineCurrency: string | null;
  amount: number | null;
  exchangeRate: number | null;
  transactionType: TransactionType | null;
  notes: string | null;
}

const POSTED_JOURNAL_LINES_SQL = `
  SELECT
    j.id AS journal_id,
    j.currency_code AS journal_currency,
    j.description AS description,
    j.journal_date AS journal_date,
    t.id AS transaction_id,
    t.account_id AS account_id,
    a.name AS account_name,
    a.currency_code AS account_currency,
    t.currency_code AS line_currency,
    t.amount AS amount,
    t.exchange_rate AS exchange_rate,
    t.transaction_type AS transaction_type,
    t.notes AS notes
  FROM journals j
  LEFT JOIN transactions t
    ON t.journal_id = j.id AND t.deleted_at IS NULL AND t.workplace_id = ?
  LEFT JOIN accounts a
    ON a.id = t.account_id AND a.deleted_at IS NULL AND a.workplace_id = ?
  WHERE j.workplace_id = ?
    AND j.deleted_at IS NULL
    AND j.status = ?
`;

function groupRows(rows: readonly RawJournalBalanceRow[]): JournalBalanceSource[] {
  const byJournalId = new Map<string, JournalBalanceSource>();
  for (const row of rows) {
    let journal = byJournalId.get(row.journalId);
    if (!journal) {
      journal = {
        journalId: row.journalId,
        description: row.description ?? undefined,
        journalDate: row.journalDate,
        currencyCode: row.journalCurrency,
        lines: [],
      };
      byJournalId.set(row.journalId, journal);
    }
    if (row.transactionId === null || row.accountId === null || row.transactionType === null) {
      continue;
    }
    journal.lines.push({
      id: row.transactionId,
      accountId: row.accountId,
      accountName: row.accountName ?? undefined,
      accountCurrency: row.accountCurrency ?? undefined,
      currencyCode: row.lineCurrency ?? '',
      amount: Number(row.amount),
      exchangeRate: row.exchangeRate ?? undefined,
      transactionType: row.transactionType,
      notes: row.notes ?? undefined,
    });
  }
  return [...byJournalId.values()];
}

async function sourcesFromModels(
  workplaceId: WorkplaceId,
  journals: readonly Journal[],
  transactions: readonly Transaction[],
): Promise<JournalBalanceSource[]> {
  const accounts = await accountQueryRepository.findAll(workplaceId);
  const accountById = new Map(accounts.map(account => [account.id as string, account]));
  const byJournalId = new Map<string, JournalBalanceSource>(
    journals
      .filter(journal => journal.status === JournalStatus.POSTED)
      .map(journal => [
        journal.id,
        {
          journalId: journal.id,
          description: journal.description,
          journalDate: journal.journalDate,
          currencyCode: journal.currencyCode,
          lines: [],
        },
      ]),
  );
  for (const transaction of transactions) {
    const account = accountById.get(transaction.accountId);
    byJournalId.get(transaction.journalId)?.lines.push({
      id: transaction.id,
      accountId: transaction.accountId,
      accountName: account?.name,
      accountCurrency: account?.currencyCode,
      currencyCode: transaction.currencyCode,
      amount: transaction.amount,
      exchangeRate: transaction.exchangeRate ?? undefined,
      transactionType: transaction.transactionType,
      notes: transaction.notes,
    });
  }
  return [...byJournalId.values()];
}

/** Every posted journal in the workplace; one raw query where the adapter supports it. */
export async function findPostedJournalBalanceSources(
  workplaceId: WorkplaceId,
): Promise<JournalBalanceSource[]> {
  const rows = await transactionRawRepository.queryRaw<RawJournalBalanceRow>(
    POSTED_JOURNAL_LINES_SQL,
    [workplaceId, workplaceId, workplaceId, JournalStatus.POSTED],
  );
  if (rows !== null) return groupRows(rows);
  const [journals, transactions] = await Promise.all([
    journalQueryRepository.findAllPosted(workplaceId),
    transactionQueryRepository.findAllActive(workplaceId),
  ]);
  return sourcesFromModels(workplaceId, journals, transactions);
}

/** The given journals, skipping any that are no longer posted. */
export async function findPostedJournalBalanceSourcesByIds(
  workplaceId: WorkplaceId,
  journalIds: readonly JournalId[],
): Promise<JournalBalanceSource[]> {
  const ids = [...journalIds];
  const [journals, transactions] = await Promise.all([
    journalQueryRepository.findByIds(workplaceId, ids),
    transactionQueryRepository.findByJournals(workplaceId, ids),
  ]);
  return sourcesFromModels(workplaceId, journals, transactions);
}
