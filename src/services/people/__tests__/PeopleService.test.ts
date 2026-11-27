import { accountWriteRepository } from '@/src/data/repositories/account';
import { JournalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { personQueryRepository, personWriteRepository } from '@/src/data/repositories/people';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { equalSplit } from '@/src/domain/people';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import * as PeopleService from '@/src/services/people';
import { preferences } from '@/src/services/preferences';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { AccountSubtype, AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';

const workplaceId = 'people-service-test' as WorkplaceId;
const journalRepo = new JournalPersistenceRepository();

async function createAccount(input: {
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode?: string;
  parentAccountId?: ReturnType<typeof String> & never;
}) {
  return accountWriteRepository.create({
    workplaceId,
    name: input.name,
    accountType: input.accountType,
    accountSubtype: input.accountSubtype,
    currencyCode: input.currencyCode ?? 'INR',
  });
}

describe('PeopleService integration', () => {
  beforeEach(async () => {
    await resetDatabase();
    preferences.workplace.update(workplaceId, { autoSettlePeopleBalances: false });
  });

  it('supports person lifecycle and account linking rules', async () => {
    const person = await PeopleService.createPerson(workplaceId, { name: 'Ari' });
    const renamed = await PeopleService.renamePerson(workplaceId, person.id, 'Ariana');
    expect(renamed.name).toBe('Ariana');

    const archived = await PeopleService.setPersonArchived(workplaceId, person.id, true);
    expect(archived.archivedAt).toBeTruthy();

    const activePeople = await PeopleService.peopleReadService.listPeopleWithBalances(
      workplaceId,
      'INR',
    );
    expect(activePeople).toHaveLength(0);
    const allPeople = await PeopleService.peopleReadService.listPeopleWithBalances(
      workplaceId,
      'INR',
      { includeArchived: true },
    );
    expect(allPeople).toHaveLength(1);

    const creditCard = await createAccount({
      name: 'Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
    });
    await expect(
      PeopleService.linkExistingAccount(workplaceId, person.id, creditCard.id),
    ).rejects.toThrow();

    const loan = await createAccount({
      name: 'Cashew Loan',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.LOAN,
    });
    await PeopleService.linkExistingAccount(workplaceId, person.id, loan.id);
    await expect(PeopleService.softDeletePerson(workplaceId, person.id)).rejects.toThrow();

    const orphan = await PeopleService.createPerson(workplaceId, { name: 'Temp' });
    await PeopleService.softDeletePerson(workplaceId, orphan.id);
    expect(await personQueryRepository.findPerson(workplaceId, orphan.id)).toBeNull();
  });

  it('splits an existing 9,000 posted expense and distributes equalSplit(100, 3) remainder deterministically', async () => {
    const bank = await createAccount({ name: 'Bank', accountType: AccountType.ASSET });
    const dinner = await createAccount({ name: 'Dinner', accountType: AccountType.EXPENSE });
    const alice = await PeopleService.createPerson(workplaceId, { name: 'Alice' });
    const bob = await PeopleService.createPerson(workplaceId, { name: 'Bob' });

    const original = await journalRepo.put(
      {
        journalDate: 1_700_000_000_000,
        description: 'Team dinner',
        currencyCode: 'INR',
        status: JournalStatus.POSTED,
        transactions: [
          { accountId: dinner.id, amount: 9000, transactionType: TransactionType.DEBIT },
          { accountId: bank.id, amount: 9000, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

    const updated = await PeopleService.saveSplitExpense(workplaceId, {
      existingJournalId: original.journal.id,
      journalDate: original.journal.journalDate,
      description: 'Team dinner',
      currencyCode: 'INR',
      fundingAccountId: bank.id,
      expenseAccountId: dinner.id,
      userShare: 3000,
      participants: [
        { personId: alice.id, amount: 3000 },
        { personId: bob.id, amount: 3000 },
      ],
    });
    expect(updated.id).toBe(original.journal.id);

    const bankBalance = await balanceReadService.getAccountBalance(bank.id, workplaceId);
    const dinnerBalance = await balanceReadService.getAccountBalance(dinner.id, workplaceId);
    expect(bankBalance.balance).toBe(-9000);
    expect(dinnerBalance.balance).toBe(3000);

    const items = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: updated.id,
    });
    expect(items).toHaveLength(2);

    const [userShare, shareA, shareB] = equalSplit(100, 3, 'INR');
    expect(userShare! + shareA! + shareB!).toBeCloseTo(100, 2);
    await PeopleService.saveSplitExpense(workplaceId, {
      journalDate: 1_700_000_100_000,
      description: 'Coffee',
      currencyCode: 'INR',
      fundingAccountId: bank.id,
      expenseAccountId: dinner.id,
      userShare: userShare!,
      participants: [
        { personId: alice.id, amount: shareA! },
        { personId: bob.id, amount: shareB! },
      ],
    });
    const detail = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      alice.id,
      'INR',
    );
    expect(detail?.balanceSummary.currencies[0]?.owedToYou).toBeCloseTo(3000 + shareA!, 2);
  });

  it('matches an existing captured journal on repayment without double-counting bank cash', async () => {
    const bank = await createAccount({ name: 'Bank', accountType: AccountType.ASSET });
    const equity = await createAccount({ name: 'Opening', accountType: AccountType.EQUITY });
    const dinner = await createAccount({ name: 'Dinner', accountType: AccountType.EXPENSE });
    const alice = await PeopleService.createPerson(workplaceId, { name: 'Alice' });

    await journalRepo.put(
      {
        journalDate: 1_700_000_000_000,
        currencyCode: 'INR',
        status: JournalStatus.POSTED,
        transactions: [
          { accountId: bank.id, amount: 5000, transactionType: TransactionType.DEBIT },
          { accountId: equity.id, amount: 5000, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

    const split = await PeopleService.saveSplitExpense(workplaceId, {
      journalDate: 1_700_000_100_000,
      currencyCode: 'INR',
      fundingAccountId: bank.id,
      expenseAccountId: dinner.id,
      userShare: 2000,
      participants: [{ personId: alice.id, amount: 1000 }],
    });
    const [openItem] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: split.id,
    });
    const capturedDate = 1_700_000_200_000;
    const captured = await journalRepo.put(
      {
        journalDate: capturedDate,
        description: 'UPI from Alice',
        currencyCode: 'INR',
        status: JournalStatus.POSTED,
        transactions: [
          { accountId: bank.id, amount: 1000, transactionType: TransactionType.DEBIT },
          { accountId: equity.id, amount: 1000, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

    const settled = await PeopleService.recordRepayment(workplaceId, {
      personId: alice.id,
      targetAccountId: openItem!.accountId,
      cashAccountId: bank.id,
      cashAmount: 1000,
      journalDate: 1_700_000_999_999,
      journalCurrency: 'INR',
      existingJournalId: captured.journal.id,
      allocations: [{ openItemId: openItem!.id, amount: 1000 }],
    });
    expect(settled.id).toBe(captured.journal.id);
    expect(settled.journalDate).toBe(capturedDate);

    const bankBalance = await balanceReadService.getAccountBalance(bank.id, workplaceId);
    expect(bankBalance.balance).toBe(3000);
    const detail = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      alice.id,
      'INR',
    );
    expect(detail?.openItems[0]?.remainder).toBe(0);
  });

  it('handles friend-paid bills (repayable vs gift) and 4-cell direct movements', async () => {
    const bank = await createAccount({ name: 'Bank', accountType: AccountType.ASSET });
    const food = await createAccount({ name: 'Food', accountType: AccountType.EXPENSE });
    const ari = await PeopleService.createPerson(workplaceId, { name: 'Ari' });

    await PeopleService.saveFriendPaidBill(workplaceId, {
      journalDate: 1_700_000_000_000,
      description: 'Friend paid repayable',
      currencyCode: 'INR',
      expenseAccountId: food.id,
      payerPersonId: ari.id,
      userShare: 400,
      repayable: true,
    });
    await PeopleService.saveFriendPaidBill(workplaceId, {
      journalDate: 1_700_000_050_000,
      description: 'Friend paid treat',
      currencyCode: 'INR',
      expenseAccountId: food.id,
      payerPersonId: ari.id,
      userShare: 250,
      repayable: false,
    });

    await PeopleService.recordPersonMovement(workplaceId, {
      journalDate: 1_700_000_100_000,
      currencyCode: 'INR',
      personId: ari.id,
      counterAccountId: bank.id,
      amount: 150,
      flow: 'lend',
    });
    await PeopleService.recordPersonMovement(workplaceId, {
      journalDate: 1_700_000_200_000,
      currencyCode: 'INR',
      personId: ari.id,
      counterAccountId: bank.id,
      amount: 100,
      flow: 'borrow',
    });
    await PeopleService.recordPersonMovement(workplaceId, {
      journalDate: 1_700_000_300_000,
      currencyCode: 'INR',
      personId: ari.id,
      counterAccountId: bank.id,
      amount: 50,
      flow: 'gift_paid',
    });
    await PeopleService.recordPersonMovement(workplaceId, {
      journalDate: 1_700_000_400_000,
      currencyCode: 'INR',
      personId: ari.id,
      counterAccountId: bank.id,
      amount: 75,
      flow: 'gift_received',
    });

    const detail = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      ari.id,
      'INR',
    );
    expect(detail?.linkedAccounts.length).toBeGreaterThanOrEqual(4);
    expect(detail?.balanceSummary.currencies[0]).toEqual({
      currencyCode: 'INR',
      owedToYou: 150,
      youOwe: 500,
      net: -350,
    });
    expect(detail?.openItems).toHaveLength(3);
  });

  it('supports attaching an existing Cashew RECEIVABLE/LOAN account and settling against it', async () => {
    const bank = await createAccount({ name: 'Bank', accountType: AccountType.ASSET });
    const equity = await createAccount({ name: 'Opening', accountType: AccountType.EQUITY });
    const receivable = await createAccount({
      name: 'Sam Receivable',
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.RECEIVABLE,
    });
    await journalRepo.put(
      {
        journalDate: 1_700_000_000_000,
        currencyCode: 'INR',
        status: JournalStatus.POSTED,
        transactions: [
          { accountId: receivable.id, amount: 1200, transactionType: TransactionType.DEBIT },
          { accountId: equity.id, amount: 1200, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

    const sam = await PeopleService.createPerson(workplaceId, { name: 'Sam' });
    await PeopleService.linkExistingAccount(workplaceId, sam.id, receivable.id);

    await PeopleService.recordRepayment(workplaceId, {
      personId: sam.id,
      targetAccountId: receivable.id,
      cashAccountId: bank.id,
      cashAmount: 500,
      journalDate: 1_700_000_100_000,
      journalCurrency: 'INR',
      allocations: [],
      unassignedAmount: 500,
    });

    const detail = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      sam.id,
      'INR',
    );
    expect(detail?.linkedAccounts).toHaveLength(1);
    expect(detail?.balanceSummary.currencies[0]?.owedToYou).toBe(700);
  });

  it('auto-settles same-currency balances only when Workplace opt-in is enabled', async () => {
    const bank = await createAccount({ name: 'Bank', accountType: AccountType.ASSET });
    const food = await createAccount({ name: 'Food', accountType: AccountType.EXPENSE });
    const usdBank = await createAccount({
      name: 'USD Bank',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const rhea = await PeopleService.createPerson(workplaceId, { name: 'Rhea' });

    await PeopleService.recordPersonMovement(workplaceId, {
      journalDate: 1_700_000_000_000,
      currencyCode: 'INR',
      personId: rhea.id,
      counterAccountId: bank.id,
      amount: 500,
      flow: 'lend',
    });
    await PeopleService.saveFriendPaidBill(workplaceId, {
      journalDate: 1_700_000_100_000,
      currencyCode: 'INR',
      expenseAccountId: food.id,
      payerPersonId: rhea.id,
      userShare: 300,
      repayable: true,
    });
    const detailDisabled = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      rhea.id,
      'INR',
    );
    expect(detailDisabled?.balanceSummary.currencies[0]).toEqual({
      currencyCode: 'INR',
      owedToYou: 500,
      youOwe: 300,
      net: 200,
    });

    preferences.workplace.update(workplaceId, { autoSettlePeopleBalances: true });
    const leo = await PeopleService.createPerson(workplaceId, { name: 'Leo' });
    await PeopleService.recordPersonMovement(workplaceId, {
      journalDate: 1_700_000_000_000,
      currencyCode: 'USD',
      personId: leo.id,
      counterAccountId: usdBank.id,
      amount: 20,
      flow: 'lend',
    });
    await PeopleService.recordPersonMovement(workplaceId, {
      journalDate: 1_700_000_050_000,
      currencyCode: 'INR',
      personId: leo.id,
      counterAccountId: bank.id,
      amount: 500,
      flow: 'lend',
    });
    await PeopleService.saveFriendPaidBill(workplaceId, {
      journalDate: 1_700_000_100_000,
      currencyCode: 'INR',
      expenseAccountId: food.id,
      payerPersonId: leo.id,
      userShare: 300,
      repayable: true,
    });

    const leoDetail = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      leo.id,
      'INR',
    );
    const inr = leoDetail?.balanceSummary.currencies.find(c => c.currencyCode === 'INR');
    const usd = leoDetail?.balanceSummary.currencies.find(c => c.currencyCode === 'USD');
    expect(inr).toEqual({ currencyCode: 'INR', owedToYou: 200, youOwe: 0, net: 200 });
    expect(usd).toEqual({ currencyCode: 'USD', owedToYou: 20, youOwe: 0, net: 20 });
  });

  it('handles cross-currency repayment, unassigned allocation, We are settled, and negative blocking', async () => {
    const bankInr = await createAccount({ name: 'INR Bank', accountType: AccountType.ASSET });
    const usdBank = await createAccount({
      name: 'USD Bank',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const mia = await PeopleService.createPerson(workplaceId, { name: 'Mia' });

    const lendJournal = await PeopleService.recordPersonMovement(workplaceId, {
      journalDate: 1_700_000_000_000,
      currencyCode: 'USD',
      personId: mia.id,
      counterAccountId: usdBank.id,
      amount: 100,
      flow: 'lend',
    });
    const [usdItem] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: lendJournal.id,
    });

    await PeopleService.recordRepayment(workplaceId, {
      personId: mia.id,
      targetAccountId: usdItem!.accountId,
      cashAccountId: bankInr.id,
      cashAmount: 4000,
      journalDate: 1_700_000_100_000,
      journalCurrency: 'INR',
      exchangeRate: 80,
      targetAmount: 50,
      allocations: [{ openItemId: usdItem!.id, amount: 50 }],
    });

    const detailMid = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      mia.id,
      'INR',
    );
    expect(detailMid?.openItems[0]?.remainder).toBe(50);

    await PeopleService.executeWeAreSettled(workplaceId, {
      personId: mia.id,
      workplaceCurrency: 'INR',
      exchangeRateByCurrency: new Map([['USD', 80]]),
    });
    const detailAfterSettle = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      mia.id,
      'INR',
    );
    expect(detailAfterSettle?.balanceSummary.currencies.every(c => c.net === 0)).toBe(true);

    const nina = await PeopleService.createPerson(workplaceId, { name: 'Nina' });
    const j1 = await PeopleService.recordPersonMovement(workplaceId, {
      journalDate: 1_700_000_000_000,
      currencyCode: 'INR',
      personId: nina.id,
      counterAccountId: bankInr.id,
      amount: 500,
      flow: 'lend',
    });
    const [item1] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: j1.id,
    });
    const repayJournal = await PeopleService.recordRepayment(workplaceId, {
      personId: nina.id,
      targetAccountId: item1!.accountId,
      cashAccountId: bankInr.id,
      cashAmount: 200,
      journalDate: 1_700_000_100_000,
      journalCurrency: 'INR',
      allocations: [],
      unassignedAmount: 200,
    });
    await PeopleService.allocateUnassignedRepayment(workplaceId, {
      personId: nina.id,
      targetAccountId: item1!.accountId,
      settlementJournalId: repayJournal.id,
      allocations: [{ openItemId: item1!.id, amount: 200 }],
    });

    await runAccountingWriteSession(session =>
      personWriteRepository.upsertOpenItemInSession(session, workplaceId, {
        personId: nina.id,
        originatingJournalId: j1.id,
        accountId: item1!.accountId,
        direction: 'receivable',
        originalAmount: 900,
        currencyCode: 'INR',
      }),
    );
    await expect(
      PeopleService.executeWeAreSettled(workplaceId, {
        personId: nina.id,
        workplaceCurrency: 'INR',
      }),
    ).rejects.toThrow();
  });

  it('creates a person with initial linked account and updates rich profile attributes', async () => {
    const cashReceivable = await createAccount({
      name: 'Pri Receivable',
      accountType: AccountType.ASSET,
      accountSubtype: AccountSubtype.RECEIVABLE,
    });
    const pri = await PeopleService.createPerson(workplaceId, {
      name: 'Pri',
      color: '#6366F1',
      defaultCurrencyCode: 'USD',
      paymentHandle: 'pri@upi',
      initialAccountId: cashReceivable.id,
    });
    const detail = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      pri.id,
      'INR',
    );
    expect(detail?.linkedAccounts.map(a => a.account.id)).toEqual([cashReceivable.id]);
    expect(detail?.person.defaultCurrencyCode).toBe('USD');

    const updated = await PeopleService.updatePerson(workplaceId, pri.id, {
      phone: '555-0100',
      email: 'pri@example.com',
      notes: 'Flatmate',
      isPinned: true,
    });
    expect(updated.phone).toBe('555-0100');
    expect(updated.email).toBe('pri@example.com');
    expect(updated.notes).toBe('Flatmate');
    expect(updated.isPinned).toBe(true);
  });
});
