import {
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { personWriteRepository } from '@/src/data/repositories/people';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import {
  buildDirectPersonMovement,
  buildFriendPaidSplit,
  buildUserPaidSplit,
} from '@/src/domain/people/personSplitPlanner';
import { ensurePersonAccountInSession } from './peopleLifecycleCommands';
import { autoSettlePersonInSession } from './peopleSettlementCommands';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, PersonId, WorkplaceId } from '@/src/types/ids';

export async function saveSplitExpense(
  workplaceId: WorkplaceId,
  input: {
    existingJournalId?: JournalId;
    journalDate: number;
    description?: string;
    notes?: string;
    currencyCode: string;
    fundingAccountId?: AccountId;
    expenseAccountId: AccountId;
    userShare: number;
    participants: readonly {
      personId: PersonId;
      amount: number;
      receivableAccountId?: AccountId;
    }[];
  },
) {
  return runAccountingWriteSession(async session => {
    const existingJournal = input.existingJournalId
      ? await journalQueryRepository.find(workplaceId, input.existingJournalId)
      : null;
    if (input.existingJournalId && !existingJournal) throw new Error('Journal not found');
    const existingTx = input.existingJournalId
      ? await transactionQueryRepository.findByJournal(workplaceId, input.existingJournalId)
      : [];
    const currencyCode = input.currencyCode || existingJournal?.currencyCode || '';
    const fundingAccountId =
      input.fundingAccountId ??
      existingTx.find(tx => tx.transactionType === TransactionType.CREDIT)?.accountId;
    if (!fundingAccountId) throw new Error('Funding account is required');
    const participantReceivableIds = await Promise.all(
      input.participants.map(
        async p =>
          p.receivableAccountId ??
          (
            await ensurePersonAccountInSession(
              session,
              workplaceId,
              p.personId,
              'receivable',
              currencyCode,
            )
          ).id,
      ),
    );
    const lines = buildUserPaidSplit({
      fundingAccountId,
      expenseAccountId: input.expenseAccountId,
      participantReceivableIds,
      shares: [input.userShare, ...input.participants.map(p => p.amount)],
      currencyCode,
    });
    const result = await journalPersistenceRepository.putInSession(
      session,
      {
        ...(input.existingJournalId ? { journalId: input.existingJournalId } : {}),
        journalDate: existingJournal?.journalDate ?? input.journalDate,
        description: existingJournal?.description ?? input.description,
        notes: existingJournal?.notes ?? input.notes,
        currencyCode,
        status: JournalStatus.POSTED,
        transactions: lines,
      },
      workplaceId,
    );
    for (let i = 0; i < input.participants.length; i++) {
      const p = input.participants[i]!;
      if (p.amount > 0)
        await personWriteRepository.upsertOpenItemInSession(session, workplaceId, {
          personId: p.personId,
          originatingJournalId: result.journal.id,
          accountId: participantReceivableIds[i]!,
          direction: 'receivable',
          originalAmount: p.amount,
          currencyCode,
        });
    }
    for (const personId of new Set(input.participants.map(p => p.personId))) {
      await autoSettlePersonInSession(session, workplaceId, personId, result.journal.journalDate);
    }
    return result.journal;
  });
}

export function saveFriendPaidBill(
  workplaceId: WorkplaceId,
  input: {
    journalDate: number;
    description?: string;
    notes?: string;
    currencyCode: string;
    expenseAccountId: AccountId;
    payerPersonId: PersonId;
    payerAccountId?: AccountId;
    userShare: number;
    repayable: boolean;
  },
) {
  return runAccountingWriteSession(async session => {
    const personAccountId =
      input.payerAccountId ??
      (
        await ensurePersonAccountInSession(
          session,
          workplaceId,
          input.payerPersonId,
          input.repayable ? 'payable' : 'income',
          input.currencyCode,
        )
      ).id;
    const lines = buildFriendPaidSplit({
      expenseAccountId: input.expenseAccountId,
      personAccountId,
      userShare: input.userShare,
      personShare: input.userShare,
      repayable: input.repayable,
      currencyCode: input.currencyCode,
    });
    const result = await journalPersistenceRepository.putInSession(
      session,
      {
        journalDate: input.journalDate,
        description: input.description,
        notes: input.notes,
        currencyCode: input.currencyCode,
        status: JournalStatus.POSTED,
        transactions: lines,
      },
      workplaceId,
    );
    if (input.repayable && input.userShare > 0) {
      await personWriteRepository.upsertOpenItemInSession(session, workplaceId, {
        personId: input.payerPersonId,
        originatingJournalId: result.journal.id,
        accountId: personAccountId,
        direction: 'payable',
        originalAmount: input.userShare,
        currencyCode: input.currencyCode,
      });
      await autoSettlePersonInSession(
        session,
        workplaceId,
        input.payerPersonId,
        result.journal.journalDate,
      );
    }
    return result.journal;
  });
}

export function recordPersonMovement(
  workplaceId: WorkplaceId,
  input: {
    journalDate: number;
    description?: string;
    notes?: string;
    currencyCode: string;
    personId: PersonId;
    counterAccountId: AccountId;
    personAccountId?: AccountId;
    amount: number;
    flow: 'lend' | 'gift_paid' | 'borrow' | 'gift_received';
  },
) {
  return runAccountingWriteSession(async (session: AccountingWriteSession) => {
    const role = {
      lend: 'receivable',
      gift_paid: 'expense',
      borrow: 'payable',
      gift_received: 'income',
    } as const;
    const personAccountId =
      input.personAccountId ??
      (
        await ensurePersonAccountInSession(
          session,
          workplaceId,
          input.personId,
          role[input.flow],
          input.currencyCode,
        )
      ).id;
    const lines = buildDirectPersonMovement({
      accountId: personAccountId,
      amount: input.amount,
      flow: input.flow,
      currencyCode: input.currencyCode,
      counterAccountId: input.counterAccountId,
    });
    const result = await journalPersistenceRepository.putInSession(
      session,
      {
        journalDate: input.journalDate,
        description: input.description,
        notes: input.notes,
        currencyCode: input.currencyCode,
        status: JournalStatus.POSTED,
        transactions: lines,
      },
      workplaceId,
    );
    if ((input.flow === 'lend' || input.flow === 'borrow') && input.amount > 0) {
      await personWriteRepository.upsertOpenItemInSession(session, workplaceId, {
        personId: input.personId,
        originatingJournalId: result.journal.id,
        accountId: personAccountId,
        direction: input.flow === 'lend' ? 'receivable' : 'payable',
        originalAmount: input.amount,
        currencyCode: input.currencyCode,
      });
      await autoSettlePersonInSession(
        session,
        workplaceId,
        input.personId,
        result.journal.journalDate,
      );
    }
    return result.journal;
  });
}
