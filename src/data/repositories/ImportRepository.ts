import { flushDatabasePersistence } from '@/src/data/database/flushPersistence';
import { database } from '@/src/data/database/Database';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import {
  prepareAuxiliaryImportRecords,
  prepareCoreImportRecords,
} from '@/src/data/repositories/importWriters';
import { prepareImportedEntityAuditRecords } from '@/src/data/repositories/importAuditWriters';
import {
  calculateImportRunningBalances,
  applyImportBalancePatches,
} from '@/src/data/repositories/importBalanceCalculator';
import type { BatchImportData } from '@/src/types/importContracts';
import { WorkplaceId } from '@/src/types/ids';
import Workplace from '@/src/data/models/Workplace';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { Model, Q } from '@nozbe/watermelondb';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import {
  evaluateJournalBalance,
  proposeUniqueJournalFxRate,
  resolveCurrencyPrecisions,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { AuditAction, JournalStatus } from '@/src/types/enums';
import { toJournalStatus, toTransactionType } from '@/src/data/repositories/importValueParsers';
import { PostedJournalImportError } from '@/src/domain/accounting/PostedJournalImportError';
import type { PostedJournalImportIssue } from '@/src/domain/accounting/PostedJournalImportError';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { WORKPLACE_DATA_TABLES } from '@/src/services/workplace/workplaceDataTables';
import { snakeToCamel } from '@/src/utils/serialization';

type NewWorkplace = {
  id: WorkplaceId;
  name: string;
  icon: string;
  defaultCurrencyCode: string;
  rowRestoreCompletionJson?: string;
};

export class ImportRepository {
  private async prepareImportData(
    data: BatchImportData,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<void> {
    const balancePatches = await calculateImportRunningBalances(data, onProgress);
    applyImportBalancePatches(data, balancePatches);
  }

  private prepareOperations(workplaceId: WorkplaceId, data: BatchImportData): Model[] {
    return [
      ...prepareCoreImportRecords(
        workplaceId,
        {
          accounts: database.collections.get<Account>('accounts'),
          journals: database.collections.get<Journal>('journals'),
          transactions: database.collections.get<Transaction>('transactions'),
        },
        { accounts: data.accounts, journals: data.journals, transactions: data.transactions },
      ),
      ...prepareAuxiliaryImportRecords(workplaceId, data),
    ];
  }

  private async validatePostedJournalBalances(
    workplaceId: WorkplaceId,
    data: BatchImportData,
  ): Promise<void> {
    const transactionsByJournalId = new Map<string, BatchImportData['transactions']>();
    for (const transaction of data.transactions) {
      if (transaction.deletedAt) continue;
      const lines = transactionsByJournalId.get(transaction.journalId) ?? [];
      lines.push(transaction);
      transactionsByJournalId.set(transaction.journalId, lines);
    }

    const postedJournals = data.journals.filter(
      journal => !journal.deletedAt && toJournalStatus(journal.status) === JournalStatus.POSTED,
    );
    if (postedJournals.length === 0) return;

    const currencyPrecision = new Map(
      (data.currencies ?? [])
        .filter(currency => currency.deletedAt == null)
        .map(currency => [currency.code.trim().toUpperCase(), currency.precision]),
    );
    const accountCurrencyById = new Map(
      data.accounts.map(account => [
        account.id,
        account.deletedAt ? undefined : account.currencyCode,
      ]),
    );

    const issues: PostedJournalImportIssue[] = [];
    for (const journal of postedJournals) {
      const transactions = transactionsByJournalId.get(journal.id) ?? [];
      const precisionByCurrency = await resolveCurrencyPrecisions(
        [
          journal.currencyCode,
          ...transactions.map(transaction => accountCurrencyById.get(transaction.accountId)),
        ],
        async code => {
          const known = currencyPrecision.get(code);
          if (known !== undefined) return known;
          const precision = await currencyRepository.getPrecision(code);
          currencyPrecision.set(code, precision);
          return precision;
        },
      );
      const input = {
        journalCurrency: journal.currencyCode,
        precisionByCurrency,
        lines: transactions.map(transaction => ({
          id: transaction.id,
          accountId: transaction.accountId,
          accountCurrency: accountCurrencyById.get(transaction.accountId),
          amount: transaction.amount,
          exchangeRate: transaction.exchangeRate,
          transactionType: toTransactionType(transaction.transactionType),
        })),
      };
      const evaluation = evaluateJournalBalance(input);
      if (evaluation.isBalanced) continue;

      const inferredFx = proposeUniqueJournalFxRate(input);
      issues.push({
        journalId: journal.id,
        details: evaluation.issues.map(issue => issue.message).join('; '),
        evaluation,
        ...(inferredFx
          ? {
              fxProposal: {
                transactionId: inferredFx.transactionId,
                exchangeRate: inferredFx.exchangeRate,
                evaluation: inferredFx.evaluation,
              },
            }
          : {}),
      });
    }
    if (issues.length > 0) throw new PostedJournalImportError(workplaceId, issues);
  }

  private async batchPreparedOperations(
    operations: Model[],
    onProgress?: (message: string, progress?: number) => void,
    atomic = false,
  ): Promise<void> {
    if (operations.length === 0) return;
    if (atomic) {
      onProgress?.(`Saving ${operations.length} records...`, 0);
      await database.batch(operations);
      onProgress?.('Saving records complete.', 1);
      return;
    }
    const chunkSize = 5000;
    for (let index = 0; index < operations.length; index += chunkSize) {
      const chunk = operations.slice(index, index + chunkSize);
      const currentCount = index + chunk.length;
      onProgress?.(
        `Saving records (${Math.min(currentCount, operations.length)}/${operations.length})...`,
        index / operations.length,
      );
      await database.batch(chunk);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    onProgress?.('Saving records complete.', 1);
  }

  async batchInsert(
    workplaceId: WorkplaceId,
    data: BatchImportData,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<void> {
    await this.prepareImportData(data, onProgress);
    await this.validatePostedJournalBalances(workplaceId, data);

    await database.write(async () => {
      await this.batchPreparedOperations(this.prepareOperations(workplaceId, data), onProgress);
    });
  }

  /** Publishes a verified row backup without changing imported identities or fabricating audit history. */
  async batchInsertRowRestore(
    workplace: NewWorkplace,
    data: BatchImportData,
    manifestHash: string,
    signal?: AbortSignal,
  ): Promise<Workplace> {
    if (!/^[0-9a-fA-F]{64}$/.test(manifestHash)) {
      throw new Error('Invalid row restore manifest hash');
    }
    const receipt = manifestHash.toLowerCase();
    throwIfRowRestoreCancelled(signal);

    // Fast-path exact retries before doing import work. This read is serialized with other
    // writers; publication repeats the same admission check after validation to close the race.
    let published: Workplace | undefined;
    await database.write(async () => {
      throwIfRowRestoreCancelled(signal);
      const existing = await database.collections
        .get<Workplace>('workplaces')
        .query(Q.where('id', workplace.id))
        .fetch();
      throwIfRowRestoreCancelled(signal);
      const existingWorkplace = existing[0];
      if (!existingWorkplace) return;
      if (existingWorkplace.rowRestoreManifestHash !== receipt) {
        throw new RowRestoreConflictError(
          'A different local Workplace already uses this identity; restore will not overwrite it.',
        );
      }
      published = existingWorkplace;
      // A preceding browser save may have failed after publication in memory.
      // Exact retries must complete persistence as well as recognize the receipt.
      await flushDatabasePersistence();
    });
    if (published) return published;

    await this.prepareImportData(data);
    await this.validatePostedJournalBalances(workplace.id, data);

    await database.write(async () => {
      throwIfRowRestoreCancelled(signal);
      const existing = await database.collections
        .get<Workplace>('workplaces')
        .query(Q.where('id', workplace.id))
        .fetch();
      throwIfRowRestoreCancelled(signal);
      const existingWorkplace = existing[0];
      if (existingWorkplace) {
        if (existingWorkplace.rowRestoreManifestHash === receipt) {
          published = existingWorkplace;
          await flushDatabasePersistence();
          return;
        }
        throw new RowRestoreConflictError(
          'A different local Workplace already uses this identity; restore will not overwrite it.',
        );
      }

      // Validate IDs and check every destination table while holding the same writer lock used
      // for publication. A collision in any table aborts before the first local write.
      for (const { table } of WORKPLACE_DATA_TABLES) {
        const values = (data as unknown as Record<string, unknown>)[snakeToCamel(table)];
        if (!Array.isArray(values) || values.length === 0) continue;
        const rows = values as { id?: unknown }[];
        const seen = new Set<string>();
        for (const row of rows) {
          if (!row || typeof row.id !== 'string' || row.id.length === 0) {
            throw new Error(`Invalid imported primary ID in ${table}`);
          }
          if (seen.has(row.id)) {
            throw new RowRestoreConflictError(`Duplicate imported identity in ${table}.`);
          }
          seen.add(row.id);
        }
        for (let offset = 0; offset < rows.length; offset += 100) {
          const ids = rows.slice(offset, offset + 100).map(row => row.id as string);
          const collisionCount = await database
            .get<Model>(table)
            .query(Q.where('id', Q.oneOf(ids)))
            .fetchCount();
          if (collisionCount > 0) {
            throw new RowRestoreConflictError(`Imported identity collision in ${table}.`);
          }
          throwIfRowRestoreCancelled(signal);
        }
      }

      throwIfRowRestoreCancelled(signal);
      published = workplaceRepository.prepareCreate({
        ...workplace,
        rowRestoreManifestHash: receipt,
      });
      // No await separates this final cancellation check from submitting the atomic batch.
      // Once the adapter has accepted the batch, cancellation cannot safely interrupt it.
      await database.batch(published, ...this.prepareOperations(workplace.id, data));
      // Keep publication and its receipt ahead of key/session/launch checkpoints on web too.
      await flushDatabasePersistence();
    });
    if (!published) throw new Error('Row restore publication did not produce a Workplace');
    return published;
  }

  /** Publishes a new Workplace and its imported records in one transaction. */
  batchInsertNewWorkplace(
    workplace: NewWorkplace,
    data: BatchImportData,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<Workplace> {
    return this.batchInsertWorkplace(workplace, data, onProgress);
  }

  private async batchInsertWorkplace(
    workplace: NewWorkplace,
    data: BatchImportData,
    onProgress?: (message: string, progress?: number) => void,
  ): Promise<Workplace> {
    await this.prepareImportData(data, onProgress);
    await this.validatePostedJournalBalances(workplace.id, data);

    const importCorrelationId = generateId();
    let created!: Workplace;
    await database.write(async () => {
      created = workplaceRepository.prepareCreate(workplace);
      await this.batchPreparedOperations(
        [
          created,
          ...this.prepareOperations(workplace.id, data),
          ...prepareImportedEntityAuditRecords(workplace.id, data, {
            correlationId: importCorrelationId,
            importPluginId: data.importMetadata?.pluginId,
            sourceFormatVersion: data.sourceFormatVersion,
          }),
          auditRepository.prepareLog(
            {
              entityType: 'workplace',
              entityId: workplace.id,
              eventType: 'workplace.restored',
              source: 'import',
              correlationId: importCorrelationId,
              action: AuditAction.CREATE,
              undoable: false,
              changes: {
                after: {
                  name: workplace.name,
                  icon: workplace.icon,
                  defaultCurrencyCode: workplace.defaultCurrencyCode,
                },
                importedAccounts: data.accounts.length,
                importedJournals: data.journals.length,
                importedTransactions: data.transactions.length,
                importedBudgets: data.budgets?.length ?? 0,
                importedPlannedPayments: data.plannedPayments?.length ?? 0,
                importedAutomationRules: data.transactionAutoPostRules?.length ?? 0,
                importedAccountMetadata: data.accountMetadata?.length ?? 0,
                importedBudgetScopes: data.budgetScopes?.length ?? 0,
                importedJournalMetadata: data.journalMetadata?.length ?? 0,
                importedInboxRecords: data.transactionInboxRecords?.length ?? 0,
                importedBalanceSnapshots: data.balanceSnapshots?.length ?? 0,
                restoredHistoryEntries: data.auditLogs?.length ?? 0,
                importPluginId: data.importMetadata?.pluginId ?? null,
                sourceFormatVersion: data.sourceFormatVersion ?? null,
              },
            },
            workplace.id,
          ),
        ],
        onProgress,
        true,
      );
    });
    return created;
  }
}

export const importRepository = new ImportRepository();

class RowRestoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RowRestoreConflictError';
  }
}

function throwIfRowRestoreCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Row restore was cancelled');
  error.name = 'AbortError';
  throw error;
}
