import { AccountType, TransactionType } from '@/src/types/enums';
import { Icon } from '@/src/types/domainIcons';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import { publishCashClarity, recoverCashClarityPublication } from '../commitCashClarity';
import { cashClarityDraft, cashClaritySalaryIncome } from './cashClarityTestFixtures';

const mockRunSession = jest.fn();
const mockStageModelWrite = jest.fn();
const mockAuditFind = jest.fn();
const mockPrepareLog = jest.fn((...args: unknown[]) => args[0]);
const mockCreateSetup = jest.fn();
const mockFindWorkplace = jest.fn();
const mockGetPrecision = jest.fn();
const mockPutJournal = jest.fn();
const mockAfterCommit = jest.fn();
const mockCreatePayment = jest.fn();
const mockCreateBudget = jest.fn();
const mockHasCompletePublication = jest.fn();
const mockFindBalanceRebuildImpact = jest.fn();

jest.mock('@/src/data/repositories/AccountingWriteSession', () => ({
  runAccountingWriteSession: (...args: unknown[]) => mockRunSession(...args),
  stageModelWrite: (...args: unknown[]) => mockStageModelWrite(...args),
}));
jest.mock('@/src/data/repositories/AuditRepository', () => ({
  auditRepository: { find: (...args: unknown[]) => mockAuditFind(...args), prepareLog: (...args: unknown[]) => mockPrepareLog(...args) },
}));
jest.mock('@/src/data/repositories/CashClarityPublicationRepository', () => ({
  cashClarityPublicationRepository: {
    hasCompletePublication: (...args: unknown[]) => mockHasCompletePublication(...args),
    findBalanceRebuildImpact: (...args: unknown[]) => mockFindBalanceRebuildImpact(...args),
  },
}));
jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: {
    createSetupInSession: (...args: unknown[]) => mockCreateSetup(...args),
    find: (...args: unknown[]) => mockFindWorkplace(...args),
  },
}));
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: { getAllWorkplaces: jest.fn(async () => []) },
}));
jest.mock('@/src/data/repositories/BudgetRepository', () => ({
  budgetRepository: { createInSession: (...args: unknown[]) => mockCreateBudget(...args) },
}));
jest.mock('@/src/data/repositories/PlannedPaymentRepository', () => ({
  plannedPaymentRepository: { createInSession: (...args: unknown[]) => mockCreatePayment(...args) },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getPrecision: (...args: unknown[]) => mockGetPrecision(...args) },
}));
jest.mock('@/src/services/journal/JournalPersistenceService', () => ({
  journalPersistenceService: {
    putInSession: (...args: unknown[]) => mockPutJournal(...args),
    afterAtomicWriteCommit: (...args: unknown[]) => mockAfterCommit(...args),
  },
}));

describe('publishCashClarity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditFind.mockResolvedValue(undefined);
    mockFindWorkplace.mockResolvedValue(undefined);
    mockGetPrecision.mockResolvedValue(2);
    mockRunSession.mockImplementation((work: (session: object) => Promise<unknown>) => work({}));
    mockPutJournal.mockImplementation(async (_session: unknown, input: Record<string, unknown>) => ({
      journal: { id: input.createJournalId },
      status: 'POSTED',
      affectedAccountIds: new Set(
        (input.transactions as { accountId: string }[]).map(line => line.accountId),
      ),
      rebuildFromDate: input.journalDate,
    }));
    mockCreatePayment.mockResolvedValue(undefined);
    mockCreateBudget.mockResolvedValue(undefined);
    mockHasCompletePublication.mockResolvedValue(true);
    mockFindBalanceRebuildImpact.mockResolvedValue({ accountIds: [], fromDate: null });
  });

  it('rejects malformed money before opening the database writer', async () => {
    const invalid = cashClarityDraft({
      accounts: [{ id: 'bank', kind: 'bank', name: 'Bank', balance: Number.NaN }],
    });

    await expect(publishCashClarity(invalid)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(mockRunSession).not.toHaveBeenCalled();
    expect(mockCreateSetup).not.toHaveBeenCalled();
  });

  it('rejects planned money without an eligible spendable account before writes', async () => {
    const invalid = cashClarityDraft({
      accounts: [{ id: 'reserve', kind: 'savings', name: 'Reserve', balance: 100, spendable: false }],
      income: { kind: 'recurring', items: [cashClaritySalaryIncome] },
    });

    await expect(publishCashClarity(invalid)).rejects.toMatchObject({
      code: 'missing_spendable_account',
    });
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it.each([0, -1])('rejects unsupported date timestamp %s before writes', async dueDate => {
    const invalid = cashClarityDraft({
      commitment: {
        kind: 'payment',
        items: [{ id: 'rent-row', name: 'Rent', type: 'rent', amount: 100, dueDate }],
      },
    });

    await expect(publishCashClarity(invalid)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it('rejects amounts beyond currency precision before writes', async () => {
    const invalid = cashClarityDraft({
      accounts: [{ id: 'bank', kind: 'bank', name: 'Bank', balance: 1.001 }],
    });

    await expect(publishCashClarity(invalid)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it('stages a balanced opening journal with stable ID and precision-safe amounts', async () => {
    const draft = cashClarityDraft({
      accounts: [
        { id: 'main', kind: 'bank', name: 'Bank', balance: 1234.56 },
        { id: 'card', kind: 'card', name: 'Card', balance: 99.12 },
      ],
    });

    await expect(publishCashClarity(draft)).resolves.toMatchObject({ status: 'published' });
    expect(mockPutJournal).toHaveBeenCalledTimes(2);
    const calls = mockPutJournal.mock.calls as [unknown, Record<string, unknown>][];
    const bankInput = calls[0][1];
    expect(bankInput.createJournalId).toBe(`cash-clarity:${draft.operationId}:journal:main`);
    expect(bankInput.currencyCode).toBe('INR');
    const bankLines = bankInput.transactions as { accountId: string; amount: number; transactionType: TransactionType }[];
    expect(bankLines).toEqual([
      expect.objectContaining({ accountId: `${draft.operationId}:onboarding-account:main`, amount: 1234.56, transactionType: TransactionType.DEBIT }),
      expect.objectContaining({ accountId: `${draft.operationId}:system:opening-balances`, amount: 1234.56, transactionType: TransactionType.CREDIT }),
    ]);
    const cardInput = calls[1][1];
    expect(cardInput.createJournalId).toBe(`cash-clarity:${draft.operationId}:journal:card`);
    const cardLines = cardInput.transactions as { accountId: string; amount: number; transactionType: TransactionType }[];
    expect(cardLines.map(line => line.amount)).toEqual([99.12, 99.12]);
    expect(cardLines[0].transactionType).toBe(TransactionType.CREDIT);
    expect(cardLines[1].transactionType).toBe(TransactionType.DEBIT);
  });

  it('publishes preserved metadata identities without inventing subtype or opening balance', async () => {
    const preservedAccount = {
      id: asAccountId('legacy:mortgage'),
      name: 'Mortgage',
      type: AccountType.LIABILITY,
      icon: Icon.Home,
    };
    const preservedBank = {
      id: asAccountId('legacy:bank'),
      name: 'Bank',
      type: AccountType.ASSET,
      icon: Icon.Wallet,
    };
    const preservedCategory = {
      id: asAccountId('legacy:food'),
      name: 'Food',
      type: AccountType.EXPENSE,
      icon: Icon.ShoppingCart,
    };
    const draft = cashClarityDraft({
      accounts: [{ id: 'main', kind: 'bank', name: 'Bank', balance: 10 }],
      preservedStarterAccounts: [preservedAccount, preservedBank],
      preservedStarterCategories: [preservedCategory],
      budget: { kind: 'set', items: [{ id: 'food-limit', name: 'Food', amount: 50, category: 'Food' }] },
    });

    await publishCashClarity(draft);

    const setup = mockCreateSetup.mock.calls[0][1] as { accounts: Record<string, unknown>[] };
    const preserved = setup.accounts.find(account => account.id === preservedAccount.id)!;
    expect(preserved).toMatchObject({
      id: preservedAccount.id,
      name: preservedAccount.name,
      accountType: AccountType.LIABILITY,
      icon: Icon.Home,
    });
    expect(preserved).not.toHaveProperty('accountSubtype');
    const bank = setup.accounts.find(account => account.id === preservedBank.id)!;
    expect(bank).toMatchObject({ id: preservedBank.id, accountType: AccountType.ASSET });
    expect(bank.accountSubtype).toBe('BANK_CHECKING');
    expect(setup.accounts).toContainEqual(expect.objectContaining({
      id: preservedCategory.id,
      name: 'Food',
      accountType: AccountType.EXPENSE,
    }));
    expect(mockPutJournal).toHaveBeenCalledTimes(1);
    expect(mockPutJournal.mock.calls[0][1].transactions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ accountId: preservedAccount.id })]),
    );
    expect(mockPutJournal.mock.calls[0][1].transactions).toEqual(
      expect.arrayContaining([expect.objectContaining({ accountId: preservedBank.id })]),
    );
    expect(mockCreateBudget.mock.calls[0][4]).toEqual([preservedCategory.id]);
    const receipt = mockStageModelWrite.mock.calls[0][1][0] as { changes: { after: { accountIds: string[] } } };
    expect(receipt.changes.after.accountIds).toContain(preservedAccount.id);
    expect(receipt.changes.after.accountIds).toContain(preservedBank.id);
    expect(receipt.changes.after.accountIds).toContain(preservedCategory.id);
  });

  it('stages account, opening journal, plans, budgets, and receipt through one session', async () => {
    const draft = cashClarityDraft({
      income: { kind: 'recurring', items: [cashClaritySalaryIncome] },
      commitment: {
        kind: 'payment',
        items: [{ id: 'rent-row', name: 'Rent', type: 'rent', amount: 1500, dueDate: Date.parse('2026-10-01') }],
      },
      budget: {
        kind: 'set',
        items: [{ id: 'food-limit', name: 'Food', amount: 6000, category: 'Food' }],
      },
    });

    const result = await publishCashClarity(draft);

    expect(result).toEqual({ workplaceId: draft.operationId, status: 'published' });
    expect(mockRunSession).toHaveBeenCalledTimes(1);
    expect(mockCreateSetup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: draft.operationId, accounts: expect.any(Array) }),
    );
    expect(mockPutJournal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ createJournalId: `cash-clarity:${draft.operationId}:journal:main` }),
      draft.operationId,
      expect.objectContaining({ eventType: 'journal.opening_balance_created' }),
    );
    expect(mockCreatePayment).toHaveBeenCalledTimes(2);
    expect(mockCreatePayment.mock.calls.map((call: unknown[]) => call[2])).toEqual([
      `cash-clarity:${draft.operationId}:planned-payment:income:pay`,
      `cash-clarity:${draft.operationId}:planned-payment:payment:rent-row`,
    ]);
    expect(mockCreateBudget).toHaveBeenCalledWith(
      expect.anything(),
      draft.operationId,
      `cash-clarity:${draft.operationId}:budget:food-limit`,
      expect.objectContaining({ amount: 6000 }),
      expect.any(Array),
      draft.operationId,
    );
    expect(mockStageModelWrite).toHaveBeenCalledTimes(1);
    expect(mockAfterCommit).toHaveBeenCalledTimes(1);
    const receipt = mockStageModelWrite.mock.calls[0][1][0] as { changes: { after: Record<string, unknown> } };
    expect(receipt.changes.after.balanceRebuildAccountIds).toEqual(expect.arrayContaining([
      `${draft.operationId}:onboarding-account:main`,
      `${draft.operationId}:system:opening-balances`,
    ]));
  });

  it('preserves an old partial Workplace instead of treating it as complete or deleting it', async () => {
    mockFindWorkplace.mockResolvedValue({ id: asWorkplaceId('workplace-op') });

    await expect(publishCashClarity(cashClarityDraft())).rejects.toMatchObject({
      code: 'ambiguous_existing_publication',
    });
    expect(mockCreateSetup).not.toHaveBeenCalled();
    expect(mockStageModelWrite).not.toHaveBeenCalled();
  });

  it('re-enqueues persisted balance impact after an interrupted post-commit enqueue', async () => {
    const draft = cashClarityDraft();
    mockAfterCommit.mockImplementationOnce(() => { throw new Error('queue unavailable'); });

    await expect(publishCashClarity(draft)).resolves.toEqual({
      workplaceId: draft.operationId,
      status: 'published',
    });
    const stagedReceipt = mockStageModelWrite.mock.calls[0][1][0] as {
      id: string;
      eventType: string;
      entityId: string;
      changes: { after: Record<string, unknown> };
    };
    mockAuditFind.mockResolvedValue({
      id: stagedReceipt.id,
      eventType: stagedReceipt.eventType,
      entityId: stagedReceipt.entityId,
      parsedChanges: { after: stagedReceipt.changes.after },
    });
    mockFindWorkplace.mockResolvedValue({ id: draft.operationId });

    await expect(recoverCashClarityPublication(draft.operationId)).resolves.toEqual({
      workplaceId: draft.operationId,
      status: 'already_published',
    });

    expect(mockAfterCommit).toHaveBeenCalledTimes(2);
    expect(mockAfterCommit.mock.calls[1][0]).toMatchObject({
      affectedAccountIds: new Set([
        `${draft.operationId}:onboarding-account:main`,
        `${draft.operationId}:system:opening-balances`,
      ]),
    });
    expect(mockHasCompletePublication).toHaveBeenCalledWith(
      draft.operationId,
      stagedReceipt.changes.after,
    );
    expect(mockCreateSetup).toHaveBeenCalledTimes(1);
    expect(mockPutJournal).toHaveBeenCalledTimes(1);
    expect(mockStageModelWrite).toHaveBeenCalledTimes(1);
    mockAfterCommit.mockImplementationOnce(() => { throw new Error('queue unavailable'); });
    await expect(recoverCashClarityPublication(draft.operationId)).rejects.toMatchObject({
      code: 'finalization_failed',
    });
  });

  it('rejects a receipt with missing published rows without enqueueing or republishing', async () => {
    const draft = cashClarityDraft();
    const manifest = {
      operationId: draft.operationId,
      accountIds: [`${draft.operationId}:onboarding-account:main`],
      journalIds: [],
      plannedPaymentIds: [],
      budgetIds: [],
      budgetScopeIds: [],
      balanceRebuildAccountIds: [],
      balanceRebuildFromDate: null,
    };
    mockAuditFind.mockResolvedValue({
      id: `cash-clarity-publication:${draft.operationId}`,
      eventType: 'workplace.setup_published',
      entityId: draft.operationId,
      parsedChanges: { after: manifest },
    });
    mockFindWorkplace.mockResolvedValue({ id: draft.operationId });
    mockHasCompletePublication.mockResolvedValue(false);

    await expect(publishCashClarity(draft)).rejects.toMatchObject({ code: 'incomplete_publication' });
    expect(mockAfterCommit).not.toHaveBeenCalled();
    expect(mockCreateSetup).not.toHaveBeenCalled();
    expect(mockStageModelWrite).not.toHaveBeenCalled();
  });

  it('recovers rebuild inputs from an older complete receipt', async () => {
    const draft = cashClarityDraft();
    const manifest = {
      operationId: draft.operationId,
      accountIds: [
        `${draft.operationId}:system:opening-balances`,
        `${draft.operationId}:onboarding-account:main`,
      ],
      journalIds: [`cash-clarity:${draft.operationId}:journal:main`],
      plannedPaymentIds: [],
      budgetIds: [],
      budgetScopeIds: [],
    };
    mockAuditFind.mockResolvedValue({
      id: `cash-clarity-publication:${draft.operationId}`,
      eventType: 'workplace.setup_published',
      entityId: draft.operationId,
      parsedChanges: { after: manifest },
    });
    mockFindWorkplace.mockResolvedValue({ id: draft.operationId });
    mockFindBalanceRebuildImpact.mockResolvedValue({
      accountIds: [
        `${draft.operationId}:system:opening-balances`,
        `${draft.operationId}:onboarding-account:main`,
      ],
      fromDate: Date.parse('2026-11-01'),
    });

    await expect(publishCashClarity(draft)).resolves.toMatchObject({ status: 'already_published' });

    expect(mockFindBalanceRebuildImpact).toHaveBeenCalledWith(draft.operationId, manifest.journalIds);
    expect(mockAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        affectedAccountIds: new Set([
          `${draft.operationId}:system:opening-balances`,
          `${draft.operationId}:onboarding-account:main`,
        ]),
        rebuildFromDate: Date.parse('2026-11-01'),
      }),
      draft.operationId,
    );
    expect(mockCreateSetup).not.toHaveBeenCalled();
    expect(mockPutJournal).not.toHaveBeenCalled();
  });

});
