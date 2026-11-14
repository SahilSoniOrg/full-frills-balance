import { asWorkplaceId } from '@/src/types/ids';
import { publishCashClarity } from '../commitCashClarity';
import { cashClarityDraft, cashClaritySalaryIncome } from './cashClarityTestFixtures';

const mockRunSession = jest.fn();
const mockStageModelWrite = jest.fn();
const mockAuditFind = jest.fn();
const mockCreateSetup = jest.fn();
const mockFindWorkplace = jest.fn();
const mockGetPrecision = jest.fn();
const mockPutJournal = jest.fn();
const mockAfterCommit = jest.fn();
const mockCreatePayment = jest.fn();
const mockCreateBudget = jest.fn();
const mockFetch = jest.fn();

jest.mock('@/src/data/repositories/AccountingWriteSession', () => ({
  runAccountingWriteSession: (...args: unknown[]) => mockRunSession(...args),
  stageModelWrite: (...args: unknown[]) => mockStageModelWrite(...args),
}));
jest.mock('@/src/data/repositories/AuditRepository', () => ({
  auditRepository: { find: (...args: unknown[]) => mockAuditFind(...args), prepareLog: jest.fn() },
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
jest.mock('@/src/services/preferences', () => ({
  preferences: { device: { deviceRegistered: false, setActiveWorkplaceId: jest.fn() } },
}));
jest.mock('@/src/services/analytics', () => ({
  analytics: { track: jest.fn(), trackConversion: jest.fn() },
}));
jest.mock('../setupFinishers', () => ({ finishDeviceSetup: jest.fn() }));
jest.mock('../../SetupDraftStore', () => ({ clearSetupDraft: jest.fn() }));
jest.mock('../pendingWorkplace', () => ({ clearPendingCashClarityWorkplaceId: jest.fn() }));
jest.mock('@/src/data/database/Database', () => ({
  database: {
    get: (...args: unknown[]) => ({ query: (...queryArgs: unknown[]) => ({ fetch: (...fetchArgs: unknown[]) => mockFetch(...args, ...queryArgs, ...fetchArgs) }) }),
  },
}));

describe('publishCashClarity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditFind.mockResolvedValue(undefined);
    mockFindWorkplace.mockResolvedValue(undefined);
    mockGetPrecision.mockResolvedValue(2);
    mockRunSession.mockImplementation((work: (session: object) => Promise<unknown>) => work({}));
    mockPutJournal.mockResolvedValue({ journal: { id: 'opening' }, status: 'POSTED' });
    mockCreatePayment.mockResolvedValue(undefined);
    mockCreateBudget.mockResolvedValue(undefined);
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

  it('rejects malformed dates before opening the database writer', async () => {
    const invalid = cashClarityDraft({
      commitment: {
        kind: 'payment',
        items: [{ id: 'rent-row', name: 'Rent', type: 'rent', amount: 100, dueDate: Number.NaN }],
      },
    });

    await expect(publishCashClarity(invalid)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(mockRunSession).not.toHaveBeenCalled();
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
  });

  it('preserves an old partial Workplace instead of treating it as complete or deleting it', async () => {
    mockFindWorkplace.mockResolvedValue({ id: asWorkplaceId('workplace-op') });

    await expect(publishCashClarity(cashClarityDraft())).rejects.toMatchObject({
      code: 'ambiguous_existing_publication',
    });
    expect(mockCreateSetup).not.toHaveBeenCalled();
    expect(mockStageModelWrite).not.toHaveBeenCalled();
  });

  it('returns a verified completed operation without staging books again', async () => {
    const draft = cashClarityDraft();
    const accountIds = [
      `${draft.operationId}:system:opening-balances`,
      `${draft.operationId}:system:balance-corrections`,
      `${draft.operationId}:onboarding-account:main`,
      `${draft.operationId}:onboarding-category:groceries`,
      `${draft.operationId}:onboarding-category:food & drink`,
      `${draft.operationId}:onboarding-category:salary`,
    ];
    const manifest = {
      operationId: draft.operationId,
      accountIds,
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
    mockFetch.mockImplementation((table: string) => {
      const counts: Record<string, number> = {
        accounts: accountIds.length,
        journals: 1,
        planned_payments: 0,
        budgets: 0,
        budget_scopes: 0,
      };
      return Promise.resolve(Array.from({ length: counts[table] ?? 0 }));
    });

    await expect(publishCashClarity(draft)).resolves.toEqual({
      workplaceId: draft.operationId,
      status: 'already_published',
    });
    expect(mockCreateSetup).not.toHaveBeenCalled();
    expect(mockPutJournal).not.toHaveBeenCalled();
    expect(mockCreatePayment).not.toHaveBeenCalled();
    expect(mockCreateBudget).not.toHaveBeenCalled();
    expect(mockStageModelWrite).not.toHaveBeenCalled();
  });
});
