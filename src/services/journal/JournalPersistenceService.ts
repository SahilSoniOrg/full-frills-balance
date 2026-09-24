import Journal from '@/src/data/models/Journal';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import type {
  JournalPersistenceResult,
  MergeJournalsInput,
  PutJournalInput,
  PutJournalPatchInput,
  PutJournalRequest,
  ReassignJournalAccountsInput,
} from '@/src/data/repositories/journal/JournalPersistenceRepository';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { prepareJournalData } from '@/src/services/journal/prepareJournalData';
import { InboxProcessingStatus, TransactionType } from '@/src/types/enums';
import type { BulkDeleteUndoToken } from '@/src/types/domainJournal';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { isRebuildEligibleJournalStatus } from '@/src/utils/journalStatus';

export type JournalPersistenceServiceInput =
  | Omit<PutJournalInput, 'displayType' | 'runningBalanceByAccountId'>
  | Omit<PutJournalPatchInput, 'displayType' | 'runningBalanceByAccountId'>;

/** Application orchestration for the new journal persistence boundary. */
export class JournalPersistenceService {
  async put(input: JournalPersistenceServiceInput, workplaceId: WorkplaceId): Promise<Journal> {
    const preparedInput = await this.preparePutInput(input, workplaceId);
    const result = await journalPersistenceRepository.put(preparedInput, workplaceId);
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  /** Creates a journal and links its source inbox record in the same database write. */
  async putAndLinkInboxRecord(
    input: JournalPersistenceServiceInput,
    workplaceId: WorkplaceId,
    inboxRecordId: string,
  ): Promise<Journal> {
    const preparedInput = await this.preparePutInput(input, workplaceId);
    const result = await runAccountingWriteSession(async session => {
      const journalResult = await journalPersistenceRepository.putInSession(
        session,
        preparedInput,
        workplaceId,
      );
      await transactionInboxRepository.stageLinkByIdInSession(
        session,
        workplaceId,
        inboxRecordId,
        journalResult.journal.id,
        InboxProcessingStatus.IMPORTED,
      );
      return journalResult;
    });
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  /** Prepare and stage a journal write in a caller-owned accounting session. */
  async putInSession(
    session: AccountingWriteSession,
    input: JournalPersistenceServiceInput,
    workplaceId: WorkplaceId,
  ): Promise<JournalPersistenceResult> {
    const preparedInput = await this.preparePutInput(input, workplaceId);
    return journalPersistenceRepository.putInSession(session, preparedInput, workplaceId);
  }

  async putMany(
    inputs: readonly JournalPersistenceServiceInput[],
    workplaceId: WorkplaceId,
  ): Promise<Journal[]> {
    const preparedInputs = await Promise.all(
      inputs.map(input => this.preparePutInput(input, workplaceId)),
    );
    const results = await journalPersistenceRepository.putMany(preparedInputs, workplaceId);
    this.enqueueRebuilds(results, workplaceId);
    return results.map(result => result.journal);
  }

  async post(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const result = await journalPersistenceRepository.post(journalId, workplaceId);
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  async delete(journalId: JournalId, workplaceId: WorkplaceId): Promise<void> {
    const result = await journalPersistenceRepository.delete(journalId, workplaceId);
    if (result.affectedAccountIds.size > 0) {
      rebuildQueueService.enqueueMany(
        new Set(result.affectedAccountIds),
        result.rebuildFromDate,
        workplaceId,
      );
    }
  }

  async bulkDelete(
    workplaceId: WorkplaceId,
    journalIds: readonly JournalId[],
  ): Promise<BulkDeleteUndoToken> {
    const result = await journalPersistenceRepository.bulkDelete(workplaceId, journalIds);
    if (result.affectedAccountIds.size > 0) {
      rebuildQueueService.enqueueMany(
        new Set(result.affectedAccountIds),
        result.rebuildFromDate,
        workplaceId,
      );
    }
    return result.undoToken;
  }

  async deletePlannedPayment(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
  ): Promise<void> {
    await runAccountingWriteSession(async session => {
      await plannedPaymentRepository.deleteInSession(session, workplaceId, plannedPaymentId);
      await journalPersistenceRepository.deleteUnpostedByPlannedPaymentInSession(
        session,
        workplaceId,
        plannedPaymentId,
      );
    });
  }

  async merge(input: MergeJournalsInput, workplaceId: WorkplaceId): Promise<Journal> {
    const result = await journalPersistenceRepository.merge(input, workplaceId);
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  async reassignAccounts(
    input: ReassignJournalAccountsInput,
    workplaceId: WorkplaceId,
  ): Promise<void> {
    const result = await journalPersistenceRepository.reassignAccounts(input, workplaceId);
    if (result.affectedAccountIds.size > 0) {
      rebuildQueueService.enqueueMany(
        new Set(result.affectedAccountIds),
        result.rebuildFromDate,
        workplaceId,
      );
    }
  }

  async recover(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const result = await journalPersistenceRepository.recover(journalId, workplaceId);
    if (result.affectedAccountIds.size > 0) {
      rebuildQueueService.enqueueMany(
        new Set(result.affectedAccountIds),
        result.rebuildFromDate,
        workplaceId,
      );
    }
    return result.journal;
  }

  async bulkRestore(workplaceId: WorkplaceId, token: BulkDeleteUndoToken): Promise<void> {
    const result = await journalPersistenceRepository.bulkRestore(workplaceId, token);
    if (result.affectedAccountIds.size > 0) {
      rebuildQueueService.enqueueMany(
        new Set(result.affectedAccountIds),
        result.rebuildFromDate,
        workplaceId,
      );
    }
  }

  async revertToPlanned(journalId: JournalId, workplaceId: WorkplaceId): Promise<Journal> {
    const result = await journalPersistenceRepository.revertToPlanned(journalId, workplaceId);
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  postInSession(
    session: AccountingWriteSession,
    journalId: JournalId,
    workplaceId: WorkplaceId,
    postedAt = Date.now(),
  ): Promise<JournalPersistenceResult> {
    return journalPersistenceRepository.postInSession(session, journalId, workplaceId, postedAt);
  }

  /** Enqueue derived-balance rebuilds only after the enclosing session has committed. */
  afterAtomicWriteCommit(
    results: readonly JournalPersistenceResult[],
    workplaceId: WorkplaceId,
  ): void {
    this.enqueueRebuilds(results, workplaceId);
  }

  async reverse(
    originalJournalId: JournalId,
    reason: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const originalJournal = await journalQueryRepository.find(workplaceId, originalJournalId);
    if (!originalJournal) throw new Error('Original journal not found');
    const originalTransactions = await transactionQueryRepository.findByJournal(
      workplaceId,
      originalJournalId,
    );
    const reversedAt = Date.now();
    const prepared = await prepareJournalData(
      {
        journalDate: reversedAt,
        description: `Reversal of: ${originalJournal.description || originalJournalId} (${reason})`,
        currencyCode: originalJournal.currencyCode,
        originalJournalId,
        transactions: originalTransactions.map(transaction => ({
          accountId: transaction.accountId,
          amount: transaction.amount,
          transactionType:
            transaction.transactionType === TransactionType.DEBIT
              ? TransactionType.CREDIT
              : TransactionType.DEBIT,
          notes: `Reversal: ${transaction.notes || ''}`,
          exchangeRate: transaction.exchangeRate,
          currencyCode: transaction.currencyCode,
        })),
      },
      workplaceId,
    );
    const result = await journalPersistenceRepository.reverse(
      originalJournalId,
      reason,
      workplaceId,
      reversedAt,
      prepared.displayType,
    );
    this.enqueueRebuilds([result], workplaceId);
    return result.journal;
  }

  private async preparePutInput(
    input: JournalPersistenceServiceInput,
    workplaceId: WorkplaceId,
  ): Promise<PutJournalRequest> {
    const existingJournal = input.journalId
      ? await journalQueryRepository.find(workplaceId, input.journalId)
      : null;
    if (input.journalId && !existingJournal) throw new Error('Journal not found');

    if (
      existingJournal &&
      input.currencyCode !== undefined &&
      input.currencyCode.trim().toUpperCase() !== existingJournal.currencyCode.trim().toUpperCase()
    ) {
      throw new Error('A saved journal currency cannot be changed');
    }

    const normalizedInput = {
      ...input,
      currencyCode: existingJournal?.currencyCode ?? input.currencyCode,
    };

    // Generic sparse puts (for example, description edits) retain the persisted
    // lines. The repository reloads and validates them in its write session.
    if (input.transactions === undefined) {
      if (!existingJournal) {
        throw new Error('A new journal requires transaction lines');
      }
      return {
        ...normalizedInput,
        journalId: existingJournal.id as JournalId,
        currencyCode: existingJournal.currencyCode,
      };
    }

    const journalDate = input.journalDate ?? existingJournal?.journalDate;
    const currencyCode = existingJournal?.currencyCode ?? input.currencyCode;
    if (journalDate === undefined || currencyCode === undefined) {
      throw new Error('A new journal requires a date and currency');
    }

    const effectiveStatus = input.status ?? existingJournal?.status;
    const prepared = await prepareJournalData(
      {
        ...normalizedInput,
        journalDate,
        currencyCode,
        transactions: input.transactions,
        status: effectiveStatus,
      },
      workplaceId,
    );

    return {
      ...normalizedInput,
      journalDate,
      currencyCode,
      transactions: prepared.transactions,
      displayType: prepared.displayType,
      runningBalanceByAccountId: prepared.calculatedBalances,
    };
  }

  private enqueueRebuilds(
    results: readonly Awaited<ReturnType<typeof journalPersistenceRepository.put>>[],
    workplaceId: WorkplaceId,
  ): void {
    const rebuildableResults = results.filter(
      result =>
        (result.previousStatus !== undefined &&
          isRebuildEligibleJournalStatus(result.previousStatus)) ||
        isRebuildEligibleJournalStatus(result.status),
    );
    const affectedAccountIds = new Set(
      rebuildableResults.flatMap(result => [...result.affectedAccountIds]),
    );
    if (affectedAccountIds.size === 0) return;

    const rebuildFromDate = Math.min(...rebuildableResults.map(result => result.rebuildFromDate));
    rebuildQueueService.enqueueMany(affectedAccountIds, rebuildFromDate, workplaceId);
  }
}

export const journalPersistenceService = new JournalPersistenceService();
