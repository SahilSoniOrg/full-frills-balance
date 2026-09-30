import { finishDeviceSetup } from '../../setupFinishers';
import { AccountType, PlannedPaymentInterval } from '@/src/types/enums';
import { asWorkplaceId } from '@/src/types/ids';
import { createInitialDraft, type CashClarityDraft } from '../draft';
import { commitCashClarity } from '../commitCashClarity';
import { draftAccountId, starterCategoryId } from '../mapToWorkplaceOutput';
import dayjs from 'dayjs';
import { calculateNextOccurrence } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { projectCashClarityDraft } from '../projectCashClarityDraft';

const mockFindAll = jest.fn();
const mockUpsertPayment = jest.fn();
const mockFinishWorkplaceSetup = jest.fn();
const mockUpsertBudget = jest.fn();
const mockUpdateAccount = jest.fn();
const mockAdjustBalance = jest.fn();
const mockClearPending = jest.fn();
const mockGetWorkplace = jest.fn();
const mockDeleteWorkplace = jest.fn();
const WORKPLACE_ID = asWorkplaceId('workplace-op');

jest.mock('@/src/services/accounts/accountQueries', () => ({
  accountQueries: { findAll: (...args: unknown[]) => mockFindAll(...args) },
}));

jest.mock('@/src/services/accounts/accountHierarchyCommands', () => ({
  updateAccount: (...args: unknown[]) => mockUpdateAccount(...args),
}));

jest.mock('@/src/data/database/idGenerator', () => ({
  generator: () => 'workplace-op',
}));

jest.mock('@/src/services/accounts/accountAdjustCommands', () => ({
  adjustAccountBalance: (...args: unknown[]) => mockAdjustBalance(...args),
}));

jest.mock('@/src/services/accounts/accountSystemAccounts', () => ({
  getOpeningBalancesAccountId: jest.fn(async () => 'opening'),
  isSystemAccount: () => false,
}));

jest.mock('@/src/services/budget/budgetWriteService', () => ({
  budgetWriteService: { upsertByName: (...args: unknown[]) => mockUpsertBudget(...args) },
}));

jest.mock('@/src/services/planned-payment/plannedPaymentCommands', () => ({
  upsertPlannedPaymentByName: (...args: unknown[]) => mockUpsertPayment(...args),
}));

jest.mock('@/src/services/preferences', () => ({
  preferences: { device: { setActiveWorkplaceId: jest.fn() } },
}));

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getWorkplace: (...args: unknown[]) => mockGetWorkplace(...args),
    deleteWorkplace: (...args: unknown[]) => mockDeleteWorkplace(...args),
  },
}));

jest.mock('../../SetupDraftStore', () => ({ clearSetupDraft: jest.fn() }));

jest.mock('../../setupFinishers', () => ({
  finishDeviceSetup: jest.fn(),
  finishWorkplaceSetup: (...args: unknown[]) => mockFinishWorkplaceSetup(...args),
}));

jest.mock('../pendingWorkplace', () => ({
  cashClarityWorkplaceId: () => 'workplace-op',
  clearPendingCashClarityWorkplaceId: () => mockClearPending(),
}));

function draft(overrides: Partial<CashClarityDraft> = {}): CashClarityDraft {
  return {
    ...createInitialDraft('INR', 'Personal'),
    displayName: 'Sahil',
    accounts: [{ id: 'main', kind: 'bank', name: 'Bank', balance: 0 }],
    income: { kind: 'skipped' },
    commitment: { kind: 'skipped' },
    budget: { kind: 'skipped' },
    ...overrides,
  };
}

function account(id: string, name: string, accountType: AccountType) {
  return { id, name, accountType, accountSubtype: 'BANK_CHECKING', currencyCode: 'INR' };
}

const salaryIncome = {
  id: 'pay',
  name: 'Salary',
  source: 'salary' as const,
  amount: 40000,
  interval: PlannedPaymentInterval.WEEKLY,
  intervalN: 2,
  nextDate: Date.parse('2026-09-25'),
};

describe('commitCashClarity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFinishWorkplaceSetup.mockResolvedValue('workplace-op');
    mockGetWorkplace.mockResolvedValue(undefined);
  });

  it('creates every-two-weeks income as weekly with interval 2', async () => {
    mockFindAll.mockResolvedValue([
      account(draftAccountId(WORKPLACE_ID, 'main'), 'Bank', AccountType.ASSET),
      account(starterCategoryId(WORKPLACE_ID, 'Salary'), 'Salary', AccountType.INCOME),
    ]);

    await commitCashClarity(
      draft({
        income: {
          kind: 'recurring',
          items: [salaryIncome],
        },
      }),
    );

    expect(mockFinishWorkplaceSetup).toHaveBeenCalledWith('workplace-op', expect.any(Object));
    expect(finishDeviceSetup).toHaveBeenCalled();
    expect(mockClearPending).toHaveBeenCalled();
    expect(mockUpsertPayment).toHaveBeenCalledWith(
      'workplace-op',
      expect.objectContaining({
        name: 'Salary',
        intervalType: PlannedPaymentInterval.WEEKLY,
        intervalN: 2,
        startDate: dayjs(salaryIncome.nextDate).startOf('day').valueOf(),
        recurrenceDay: 5,
        fromAccountId: starterCategoryId(WORKPLACE_ID, 'Salary'),
        toAccountId: draftAccountId(WORKPLACE_ID, 'main'),
      }),
    );
  });

  it('saves and previews one Wednesday fortnightly draft while retaining yearly month rules', async () => {
    const onboardingDraft = draft({
      income: {
        kind: 'recurring',
        items: [
          {
            ...salaryIncome,
            nextDate: Date.parse('2026-09-30T12:00:00Z'),
          },
          {
            id: 'freelance',
            name: 'Freelance',
            source: 'freelance',
            amount: 2000,
            interval: PlannedPaymentInterval.YEARLY,
            intervalN: 1,
            nextDate: Date.parse('2028-02-29T12:00:00Z'),
          },
        ],
      },
    });
    mockFindAll.mockResolvedValue([
      account(draftAccountId(WORKPLACE_ID, 'main'), 'Bank', AccountType.ASSET),
      account(starterCategoryId(WORKPLACE_ID, 'Salary'), 'Salary', AccountType.INCOME),
      account(starterCategoryId(WORKPLACE_ID, 'Freelance'), 'Freelance', AccountType.INCOME),
    ]);

    await commitCashClarity(onboardingDraft);

    const weeklySaved = mockUpsertPayment.mock.calls
      .map(([, input]) => input)
      .find(input => input.name === 'Salary');
    const yearlySaved = mockUpsertPayment.mock.calls
      .map(([, input]) => input)
      .find(input => input.name === 'Freelance');
    expect(weeklySaved).toEqual(
      expect.objectContaining({
        intervalType: PlannedPaymentInterval.WEEKLY,
        intervalN: 2,
        recurrenceDay: 3,
      }),
    );
    expect(yearlySaved).toEqual(
      expect.objectContaining({
        intervalType: PlannedPaymentInterval.YEARLY,
        recurrenceMonth: 2,
        recurrenceDay: 29,
      }),
    );
    expect(
      dayjs(
        calculateNextOccurrence(yearlySaved.startDate, {
          intervalType: yearlySaved.intervalType,
          intervalN: yearlySaved.intervalN,
          recurrenceMonth: yearlySaved.recurrenceMonth,
          recurrenceDay: yearlySaved.recurrenceDay,
        }),
      ).format('YYYY-MM-DD'),
    ).toBe('2029-02-28');

    const preview = projectCashClarityDraft(onboardingDraft, dayjs('2026-09-14T10:00:00'));
    const previewPayday = preview.chart.find(point =>
      point.events.some(event => event.name === 'Salary'),
    );
    expect(dayjs(previewPayday?.x).format('YYYY-MM-DD')).toBe('2026-09-30');
  });

  it('rethrows the same workplace id and upserts changed income on retry', async () => {
    mockFindAll.mockResolvedValue([
      account(draftAccountId(WORKPLACE_ID, 'main'), 'Bank', AccountType.ASSET),
      account(starterCategoryId(WORKPLACE_ID, 'Salary'), 'Salary', AccountType.INCOME),
    ]);
    const first = draft({
      income: { kind: 'recurring', items: [salaryIncome] },
    });
    await commitCashClarity(first);
    await commitCashClarity({
      ...first,
      income: { kind: 'recurring', items: [{ ...salaryIncome, amount: 45000 }] },
    });

    expect(mockFinishWorkplaceSetup).toHaveBeenNthCalledWith(1, 'workplace-op', expect.any(Object));
    expect(mockFinishWorkplaceSetup).toHaveBeenNthCalledWith(2, 'workplace-op', expect.any(Object));
    expect(mockUpsertPayment).toHaveBeenNthCalledWith(
      1,
      'workplace-op',
      expect.objectContaining({ name: 'Salary', amount: 40000 }),
    );
    expect(mockUpsertPayment).toHaveBeenNthCalledWith(
      2,
      'workplace-op',
      expect.objectContaining({ name: 'Salary', amount: 45000 }),
    );
  });

  it('serializes concurrent finalization attempts', async () => {
    mockFindAll.mockResolvedValue([
      account(draftAccountId(WORKPLACE_ID, 'main'), 'Bank', AccountType.ASSET),
    ]);
    let releaseFirst: (() => void) | undefined;
    const firstFinished = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    mockFinishWorkplaceSetup
      .mockImplementationOnce(async () => {
        await firstFinished;
        return WORKPLACE_ID;
      })
      .mockResolvedValue(WORKPLACE_ID);

    const first = commitCashClarity(draft());
    const second = commitCashClarity(draft());

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockFinishWorkplaceSetup).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await Promise.all([first, second]);
    expect(mockFinishWorkplaceSetup).toHaveBeenCalledTimes(2);
  });

  it('does not register the device if a later write fails', async () => {
    mockFindAll.mockResolvedValue([
      account(draftAccountId(WORKPLACE_ID, 'main'), 'Bank', AccountType.ASSET),
      account(starterCategoryId(WORKPLACE_ID, 'Salary'), 'Salary', AccountType.INCOME),
    ]);
    mockUpsertPayment.mockRejectedValueOnce(new Error('write failed'));

    await expect(
      commitCashClarity(
        draft({
          income: { kind: 'recurring', items: [salaryIncome] },
        }),
      ),
    ).rejects.toThrow('write failed');
    expect(finishDeviceSetup).not.toHaveBeenCalled();
    expect(mockDeleteWorkplace).toHaveBeenCalledWith('workplace-op');
    expect(mockClearPending).not.toHaveBeenCalled();
  });

  it('throws when salary exists without a spendable pay-from account', async () => {
    mockFindAll.mockResolvedValue([account('card-1', 'Credit Card', AccountType.LIABILITY)]);

    await expect(
      commitCashClarity(
        draft({
          accounts: [{ id: 'card', kind: 'card', name: 'Credit Card', balance: 0 }],
          income: {
            kind: 'recurring',
            items: [
              {
                id: 'pay',
                name: 'Salary',
                source: 'salary',
                amount: 40000,
                interval: PlannedPaymentInterval.MONTHLY,
                intervalN: 1,
                nextDate: Date.parse('2026-09-25'),
              },
            ],
          },
        }),
      ),
    ).rejects.toThrow('Could not save a spendable account for planned money.');
    expect(mockUpsertPayment).not.toHaveBeenCalled();
  });

  it('throws when a named account is missing from the new workplace', async () => {
    mockFindAll.mockResolvedValue([account('other-1', 'Wallet', AccountType.ASSET)]);

    await expect(commitCashClarity(draft())).rejects.toThrow('Could not save Bank.');
  });

  it('does not register the device if the workplace fails to create', async () => {
    mockFinishWorkplaceSetup.mockRejectedValueOnce(new Error('no workplace'));
    await expect(commitCashClarity(draft())).rejects.toThrow('no workplace');
    expect(finishDeviceSetup).not.toHaveBeenCalled();
  });

  it('registers the entered display name on the device', async () => {
    mockFindAll.mockResolvedValue([
      account(draftAccountId(WORKPLACE_ID, 'main'), 'Bank', AccountType.ASSET),
    ]);
    await commitCashClarity(draft({ displayName: 'Sahil' }));
    expect(finishDeviceSetup).toHaveBeenCalledWith({
      displayName: { value: 'Sahil', source: 'user_entered' },
    });
  });

  it('does not create a workplace without a name', async () => {
    await expect(commitCashClarity(draft({ displayName: '  ' }))).rejects.toThrow(
      'Could not save your name.',
    );
    expect(mockFinishWorkplaceSetup).not.toHaveBeenCalled();
    expect(finishDeviceSetup).not.toHaveBeenCalled();
  });

  it('throws when freelance income has no Freelance category', async () => {
    mockFindAll.mockResolvedValue([
      account(draftAccountId(WORKPLACE_ID, 'main'), 'Bank', AccountType.ASSET),
      account(starterCategoryId(WORKPLACE_ID, 'Salary'), 'Salary', AccountType.INCOME),
    ]);

    await expect(
      commitCashClarity(
        draft({
          income: {
            kind: 'recurring',
            items: [
              {
                id: 'pay',
                name: 'Freelance',
                source: 'freelance',
                amount: 40000,
                interval: PlannedPaymentInterval.MONTHLY,
                intervalN: 1,
                nextDate: Date.parse('2026-09-25'),
              },
            ],
          },
        }),
      ),
    ).rejects.toThrow('Could not save Freelance.');
    expect(mockUpsertPayment).not.toHaveBeenCalled();
    expect(finishDeviceSetup).not.toHaveBeenCalled();
  });

  it('throws when recurring income has no spendable account at all', async () => {
    mockFindAll.mockResolvedValue([]);

    await expect(
      commitCashClarity(
        draft({
          accounts: [],
          income: {
            kind: 'recurring',
            items: [
              {
                id: 'pay',
                name: 'Salary',
                source: 'salary',
                amount: 40000,
                interval: PlannedPaymentInterval.MONTHLY,
                intervalN: 1,
                nextDate: Date.parse('2026-09-25'),
              },
            ],
          },
        }),
      ),
    ).rejects.toThrow('Could not save a spendable account for planned money.');
  });

  it('resolves a custom budget category by its stable category key', async () => {
    mockFindAll.mockResolvedValue([
      account(draftAccountId(WORKPLACE_ID, 'main'), 'Bank', AccountType.ASSET),
      account(starterCategoryId(WORKPLACE_ID, 'Dining'), 'Dining', AccountType.EXPENSE),
    ]);

    await commitCashClarity(
      draft({
        budget: {
          kind: 'set',
          items: [{ id: 'dining-budget', name: 'Food budget', category: 'Dining', amount: 8000 }],
        },
      }),
    );

    expect(mockUpsertBudget).toHaveBeenCalledWith(
      'workplace-op',
      expect.objectContaining({ name: 'Food budget' }),
      [starterCategoryId(WORKPLACE_ID, 'Dining')],
    );
  });
});
