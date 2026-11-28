import { accountWriteRepository } from '@/src/data/repositories/account';
import { JournalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { personQueryRepository, personWriteRepository } from '@/src/data/repositories/people';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { AccountId, JournalId, PersonId, WorkplaceId } from '@/src/types/ids';
import { balanceRebuildIntentRepository } from '@/src/data/repositories/BalanceRebuildIntentRepository';
import { settlePeopleForRebuildClaim } from '@/src/services/people/peopleSettlementCommands';
import { readPersonLedgerBalance } from '@/src/services/people/peopleLedgerReads';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import * as PeopleService from '@/src/services/people';
import { preferences } from '@/src/services/preferences';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { AccountSubtype, AccountType, JournalStatus, TransactionType } from '@/src/types/enums';

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

async function post(
  workplace: WorkplaceId,
  input: {
    journalId?: JournalId;
    currencyCode: string;
    journalDate: number;
    description?: string;
    source: AccountId;
    debits: readonly { accountId: AccountId; amount: number }[];
  },
) {
  const { debits, source, ...draft } = input;
  return (
    await journalRepo.put(
      {
        ...draft,
        status: JournalStatus.POSTED,
        transactions: [
          {
            accountId: source,
            amount: debits.reduce((sum, row) => sum + row.amount, 0),
            transactionType: TransactionType.CREDIT,
          },
          ...debits.map(row => ({ ...row, transactionType: TransactionType.DEBIT })),
        ],
      },
      workplace,
    )
  ).journal;
}

async function postReceivable(
  personId: PersonId,
  cashId: AccountId,
  currencyCode: string,
  amount: number,
  journalDate: number,
) {
  const account = await PeopleService.ensurePersonAccount(
    workplaceId,
    personId,
    'receivable',
    currencyCode,
  );
  return post(workplaceId, {
    source: cashId,
    currencyCode,
    journalDate,
    debits: [{ accountId: account.id, amount }],
  });
}

describe('PeopleService integration', () => {
  beforeEach(async () => {
    await resetDatabase();
    preferences.workplace.update(workplaceId, { autoSettlePeopleBalances: false });
  });

  it('supports person lifecycle and account linking rules', async () => {
    const person = await PeopleService.createPerson(workplaceId, { name: 'Ari' });
    const renamed = await PeopleService.updatePerson(workplaceId, person.id, { name: 'Ariana' });
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
  });

  it('updates a posted expense through journal persistence and creates one open item per participant', async () => {
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

    const receivableA = await PeopleService.ensurePersonAccount(
      workplaceId,
      alice.id,
      'receivable',
      'INR',
    );
    const receivableB = await PeopleService.ensurePersonAccount(
      workplaceId,
      bob.id,
      'receivable',
      'INR',
    );
    const updated = await post(workplaceId, {
      journalId: original.journal.id,
      journalDate: original.journal.journalDate,
      description: 'Team dinner',
      currencyCode: 'INR',
      source: bank.id,
      debits: [dinner, receivableA, receivableB].map(account => ({
        accountId: account.id,
        amount: 3000,
      })),
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

    await post(workplaceId, {
      journalDate: 1_700_000_100_000,
      description: 'Coffee',
      currencyCode: 'INR',
      source: bank.id,
      debits: [
        { accountId: dinner.id, amount: 33.34 },
        { accountId: receivableA.id, amount: 33.33 },
        { accountId: receivableB.id, amount: 33.33 },
      ],
    });
    const detail = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      alice.id,
      'INR',
    );
    expect(detail?.balanceSummary.currencies[0]?.owedToYou).toBeCloseTo(3033.33, 2);
  });

  it('restores a deleted journal after an edit removed its People open item', async () => {
    const bank = await createAccount({ name: 'Bank', accountType: AccountType.ASSET });
    const groceries = await createAccount({ name: 'Groceries', accountType: AccountType.EXPENSE });
    const person = await PeopleService.createPerson(workplaceId, { name: 'Ada' });
    const original = await postReceivable(person.id, bank.id, 'INR', 100, 1);
    const itemFilter = { originatingJournalId: original.id };
    expect(await personQueryRepository.listOpenItems(workplaceId, itemFilter)).toHaveLength(1);

    await post(workplaceId, {
      journalId: original.id,
      currencyCode: 'INR',
      journalDate: original.journalDate,
      source: bank.id,
      debits: [{ accountId: groceries.id, amount: 100 }],
    });
    expect(await personQueryRepository.listOpenItems(workplaceId, itemFilter)).toHaveLength(0);

    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    await journalRepo.delete(original.id, workplaceId).finally(() => clock.mockRestore());

    const restored = await journalRepo.recover(original.id, workplaceId);
    expect(restored.journal.deletedAt).toBeFalsy();
    expect(await personQueryRepository.listOpenItems(workplaceId, itemFilter)).toHaveLength(0);
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

    const receivable = await PeopleService.ensurePersonAccount(
      workplaceId,
      alice.id,
      'receivable',
      'INR',
    );
    const split = await post(workplaceId, {
      journalDate: 1_700_000_100_000,
      currencyCode: 'INR',
      source: bank.id,
      debits: [
        { accountId: dinner.id, amount: 2000 },
        { accountId: receivable.id, amount: 1000 },
      ],
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

    const receivable = await PeopleService.ensurePersonAccount(
      workplaceId,
      ari.id,
      'receivable',
      'INR',
    );
    const payable = await PeopleService.ensurePersonAccount(workplaceId, ari.id, 'payable', 'INR');
    const sharedCost = await PeopleService.ensurePersonAccount(
      workplaceId,
      ari.id,
      'expense',
      'INR',
    );
    const sharedIncome = await PeopleService.ensurePersonAccount(
      workplaceId,
      ari.id,
      'income',
      'INR',
    );
    const movements = [
      { source: payable.id, accountId: food.id, amount: 400 },
      { source: sharedIncome.id, accountId: food.id, amount: 250 },
      { source: bank.id, accountId: receivable.id, amount: 150 },
      { source: payable.id, accountId: bank.id, amount: 100 },
      { source: bank.id, accountId: sharedCost.id, amount: 50 },
      { source: sharedIncome.id, accountId: bank.id, amount: 75 },
    ];
    for (const [index, movement] of movements.entries()) {
      await post(workplaceId, {
        source: movement.source,
        currencyCode: 'INR',
        journalDate: 1_700_000_000_000 + index * 60_000,
        debits: [{ accountId: movement.accountId, amount: movement.amount }],
      });
    }

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

  it('values the native cash leg when matching an old foreign-currency repayment', async () => {
    const usdBank = await createAccount({
      name: 'USD bank',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const euroBank = await createAccount({
      name: 'EUR bank',
      accountType: AccountType.ASSET,
      currencyCode: 'EUR',
    });
    const equity = await createAccount({
      name: 'USD opening balance',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
    });
    const person = await PeopleService.createPerson(workplaceId, { name: 'Adi' });
    const origin = await postReceivable(person.id, usdBank.id, 'USD', 99, 1_700_000_000_000);
    const [item] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: origin.id,
    });
    const movement = await journalRepo.put(
      {
        description: 'Adi repayment',
        currencyCode: 'USD',
        journalDate: 1_700_000_100_000,
        transactions: [
          {
            accountId: euroBank.id,
            amount: 90,
            exchangeRate: 1.1,
            transactionType: TransactionType.DEBIT,
          },
          { accountId: equity.id, amount: 99, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );
    const page = await PeopleService.peopleReadService.listCompatibleRepaymentJournals(
      workplaceId,
      person.id,
      {
        query: 'Adi repayment',
      },
    );
    const candidate = page.matches.find(row => row.journalId === movement.journal.id);
    expect(candidate).toMatchObject({
      cashAmount: 90,
      cashCurrencyCode: 'EUR',
      journalAmount: 99,
      currencyCode: 'USD',
    });
    if (!item || !candidate) throw new Error('Expected a valued repayment candidate');
    const command = {
      personId: person.id,
      targetAccountId: item.accountId,
      cashAccountId: candidate.cashAccountId,
      cashAmount: candidate.cashAmount,
      journalDate: candidate.journalDate,
      journalCurrency: candidate.currencyCode,
      existingJournalId: candidate.journalId,
      expectedCurrent: candidate.expectedCurrent,
      allocations: [{ openItemId: item.id, amount: 99 }],
    };
    await journalRepo.put(
      { journalId: candidate.journalId, notes: 'Reconciled with bank' },
      workplaceId,
    );
    await expect(PeopleService.recordRepayment(workplaceId, command)).rejects.toThrow();
    const latest = await PeopleService.peopleReadService.listCompatibleRepaymentJournals(
      workplaceId,
      person.id,
      {
        query: 'Adi repayment',
      },
    );
    const current = latest.matches.find(row => row.id === candidate.id);
    expect(current).toBeDefined();
    const result = await PeopleService.recordRepayment(workplaceId, {
      ...command,
      expectedCurrent: current?.expectedCurrent,
    });
    expect(result.id).toBe(movement.journal.id);
    const detail = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      person.id,
      'USD',
    );
    expect(detail?.openItems).toMatchObject([{ remainder: 0 }]);
    expect(await readPersonLedgerBalance(workplaceId, euroBank, new Map([['EUR', 2]]))).toBe(90);
  });

  it('excludes a reversing posting from repayment reads and writes', async () => {
    const bank = await createAccount({ name: 'Bank', accountType: AccountType.ASSET });
    const person = await PeopleService.createPerson(workplaceId, { name: 'Mika' });
    const first = await postReceivable(person.id, bank.id, 'INR', 100, 1_700_000_000_000);
    const second = await postReceivable(person.id, bank.id, 'INR', 100, 1_700_000_100_000);
    const reversal = await journalRepo.reverse(first.id, 'Cancelled', workplaceId);
    const [item] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: second.id,
    });
    if (!item) throw new Error('Expected the remaining open item');
    const detail = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      person.id,
      'INR',
    );
    expect(detail?.unallocatedRepayments).toEqual([]);
    await expect(
      PeopleService.allocateUnassignedRepayment(workplaceId, {
        personId: person.id,
        targetAccountId: item.accountId,
        settlementJournalId: reversal.journal.id,
        allocations: [{ openItemId: item.id, amount: 100 }],
      }),
    ).rejects.toThrow('This journal cannot be applied as a repayment');
  });

  it('processes auto-settle from a durable planned-post intent while the running balance is pending', async () => {
    const bank = await createAccount({ name: 'Bank', accountType: AccountType.ASSET });
    const food = await createAccount({ name: 'Food', accountType: AccountType.EXPENSE });
    const person = await PeopleService.createPerson(workplaceId, { name: 'Leo' });
    const receivable = await PeopleService.ensurePersonAccount(
      workplaceId,
      person.id,
      'receivable',
      'INR',
    );
    const payable = await PeopleService.ensurePersonAccount(
      workplaceId,
      person.id,
      'payable',
      'INR',
    );
    await postReceivable(person.id, bank.id, 'INR', 500, 1_700_000_000_000);
    const date = 1_700_000_100_000;
    const planned = await journalRepo.put(
      {
        journalDate: date,
        currencyCode: 'INR',
        status: JournalStatus.PLANNED,
        transactions: [
          { accountId: payable.id, amount: 300, transactionType: TransactionType.CREDIT },
          { accountId: food.id, amount: 300, transactionType: TransactionType.DEBIT },
        ],
      },
      workplaceId,
    );
    await journalRepo.post(planned.journal.id, workplaceId, date);
    const claim = (await balanceRebuildIntentRepository.listPending()).find(
      row => row.accountId === payable.id,
    );
    expect(claim?.peopleSettlementJournalDate).toBe(date);
    if (!claim) throw new Error('Expected a settlement claim');
    const precision = new Map([['INR', 2]]);
    await settlePeopleForRebuildClaim(claim);
    expect(await readPersonLedgerBalance(workplaceId, payable, precision)).toBe(300);

    preferences.workplace.update(workplaceId, { autoSettlePeopleBalances: true });
    await settlePeopleForRebuildClaim(claim);
    await settlePeopleForRebuildClaim(claim);
    expect(await readPersonLedgerBalance(workplaceId, receivable, precision)).toBe(200);
    expect(await readPersonLedgerBalance(workplaceId, payable, precision)).toBe(0);
    const allocations = await personQueryRepository.listSettlementAllocations(workplaceId, {
      personId: person.id,
      activeOnly: true,
    });
    expect(allocations.map(row => row.amount)).toEqual([300, 300]);
  });

  it('handles cross-currency repayment, unassigned allocation, We are settled, and negative blocking', async () => {
    const bankInr = await createAccount({ name: 'INR Bank', accountType: AccountType.ASSET });
    const usdBank = await createAccount({
      name: 'USD Bank',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const mia = await PeopleService.createPerson(workplaceId, { name: 'Mia' });

    const lendJournal = await postReceivable(mia.id, usdBank.id, 'USD', 100, 1_700_000_000_000);
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
    const j1 = await postReceivable(nina.id, bankInr.id, 'INR', 500, 1_700_000_000_000);
    const [item1] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: j1.id,
    });
    const repayJournal = await PeopleService.recordRepayment(workplaceId, {
      personId: nina.id,
      targetAccountId: item1!.accountId,
      cashAccountId: bankInr.id,
      cashAmount: 250,
      journalDate: 1_700_000_100_000,
      journalCurrency: 'INR',
      allocations: [],
      unassignedAmount: 250,
    });
    await PeopleService.allocateUnassignedRepayment(workplaceId, {
      personId: nina.id,
      targetAccountId: item1!.accountId,
      settlementJournalId: repayJournal.id,
      allocations: [{ openItemId: item1!.id, amount: 200 }],
    });
    const partial = await PeopleService.peopleReadService.getPersonDetail(
      workplaceId,
      nina.id,
      'INR',
    );
    expect(partial?.unallocatedRepayments).toEqual([
      { accountId: item1!.accountId, journalId: repayJournal.id, amount: 50, currencyCode: 'INR' },
    ]);

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

  it('creates and links a quick-added receivable in one session', async () => {
    const { person, account } = await PeopleService.createPersonWithReceivable(workplaceId, {
      name: 'Quick add',
      currencyCode: 'usd',
    });
    expect(account).toMatchObject({
      accountSubtype: AccountSubtype.RECEIVABLE,
      currencyCode: 'USD',
    });
    expect(
      await personQueryRepository.findPersonAccountByAccountId(workplaceId, account.id),
    ).toMatchObject({ personId: person.id, accountId: account.id });

    await expect(
      PeopleService.createPerson(workplaceId, { name: 'Conflict', initialAccountId: account.id }),
    ).rejects.toThrow('Account already linked');
    expect(await PeopleService.createPerson(workplaceId, { name: 'Conflict' })).toMatchObject({
      name: 'Conflict',
    });
  });

  it('requires explicit permission for duplicate names on create and rename', async () => {
    const original = await PeopleService.createPersonWithReceivable(workplaceId, {
      name: 'Ada',
      currencyCode: 'USD',
    });
    await expect(PeopleService.createPerson(workplaceId, { name: 'Ada' })).rejects.toThrow(
      /already exists/,
    );
    const duplicate = await PeopleService.createPerson(
      workplaceId,
      { name: '  Ada  ' },
      { allowDuplicateName: true },
    );
    expect(duplicate.name).toBe('Ada');
    expect(duplicate.id).not.toBe(original.person.id);

    const quickAdd = { name: 'ada', currencyCode: 'USD' };
    await expect(PeopleService.createPersonWithReceivable(workplaceId, quickAdd)).rejects.toThrow(
      /already exists/,
    );
    const second = await PeopleService.createPersonWithReceivable(workplaceId, quickAdd, {
      allowDuplicateName: true,
    });
    expect(second.account.name).toBe('ada (Receivable · USD) 2');

    await expect(
      PeopleService.updatePerson(workplaceId, second.person.id, { name: 'Ada' }),
    ).rejects.toThrow(/already exists/);
    const renamed = await PeopleService.updatePerson(
      workplaceId,
      second.person.id,
      { name: 'Ada' },
      { allowDuplicateName: true },
    );
    expect(renamed).toMatchObject({ id: second.person.id, name: 'Ada' });

    await expect(
      PeopleService.createPerson(workplaceId, { name: '   ' }, { allowDuplicateName: true }),
    ).rejects.toThrow('Name cannot be empty');
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
