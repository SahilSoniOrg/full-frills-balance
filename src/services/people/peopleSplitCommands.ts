import {
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import {
  buildDirectPersonMovement,
  buildFriendPaidSplit,
  buildUserPaidSplit,
} from '@/src/domain/people/personSplitPlanner';
import { ensurePersonAccountInSession } from './peopleLifecycleCommands';
import { autoSettlePerson } from './peopleSettlementCommands';
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
  const journal = await runAccountingWriteSession(async session => {
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
    return result.journal;
  });
  for (const personId of new Set(input.participants.map(p => p.personId))) {
    await autoSettlePerson(workplaceId, personId, journal.journalDate);
  }
  return journal;
}

export async function saveFriendPaidBill(
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
  const journal = await runAccountingWriteSession(async session => {
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
    return result.journal;
  });
  if (input.repayable && input.userShare > 0) {
    await autoSettlePerson(workplaceId, input.payerPersonId, journal.journalDate);
  }
  return journal;
}

export async function recordPersonMovement(
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
  const journal = await runAccountingWriteSession(async (session: AccountingWriteSession) => {
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
    return result.journal;
  });
  if ((input.flow === 'lend' || input.flow === 'borrow') && input.amount > 0) {
    await autoSettlePerson(workplaceId, input.personId, journal.journalDate);
  }
  return journal;
}
