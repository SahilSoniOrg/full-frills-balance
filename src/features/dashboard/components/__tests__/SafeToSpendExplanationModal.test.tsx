import { Simulator } from '@/src/services/simulation/Simulator';
import { FlowCategory, FlowSource } from '@/src/services/simulation/types';
import type { Flow } from '@/src/services/simulation/types';
import { AccountSubtype } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';
import { mapSafeToSpendViewModel } from '@/src/features/dashboard/mappers/SafeToSpendMapper';
import { SafeToSpendExplanationModal } from '../SafeToSpendExplanationModal';
import { AppConfig } from '@/src/constants';
import { ONBOARDING_STRINGS } from '@/src/constants/copy/domains/onboardingStrings';
import { formatDate } from '@/src/utils/dateUtils';
import { render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/overlays/ModalSurface', () => {
  const { ModalSurface: Actual } = jest.requireActual<
    typeof import('@/src/components/overlays/ModalSurface')
  >('@/src/components/overlays/ModalSurface');
  return {
    ModalSurface: (props: Parameters<typeof Actual>[0]) => (
      <Actual {...props} useNativeModal={false} />
    ),
  };
});

jest.mock('@/src/components/shared/moneyFormat', () => ({
  useMoneyFormat: () => (amount: number) => `USD ${amount.toFixed(2)}`,
  useStsMoneyFormat:
    () =>
    (amount: number, _currency: string, options: { prefix?: string } = {}) =>
      `${options.prefix ?? ''}USD ${amount.toFixed(2)}`,
}));

describe('SafeToSpendExplanationModal dated explanation', () => {
  const renderExplanation = (cash: number) => {
    const asOf = new Date(2026, 8, 30, 9).getTime();
    const flows: Flow[] = [
      {
        kind: 'OUTFLOW',
        accountId: 'cash' as AccountId,
        amount: 800,
        dayOffset: 5,
        category: FlowCategory.PLANNED_EXPENSE,
        timeframe: 'FUTURE',
        label: 'Rent',
        origin: FlowSource.PLANNED_PAYMENT,
        referenceId: 'rent',
      },
      {
        kind: 'INFLOW',
        accountId: 'cash' as AccountId,
        amount: 1500,
        dayOffset: 20,
        category: FlowCategory.INCOME,
        timeframe: 'FUTURE',
        label: 'Salary',
        origin: FlowSource.PLANNED_PAYMENT,
        referenceId: 'salary',
      },
    ];
    const engine = Simulator.simulate(
      new Map([['cash', cash]]),
      flows,
      30,
      new Set(['cash']),
      [],
      0,
      asOf,
      undefined,
      2,
    );
    const report = {
      allFlows: flows,
      summary: {
        firstMajorInflowDay: null,
        totalFutureInflow: 1500,
        totalPlannedOutflow: 800,
        totalCommittedPlanned: 800,
      },
      liabilities: {
        total: 0,
        totalCreditCard: 0,
        totalOther: 0,
        committed: 0,
        committedCreditCard: 0,
        committedOther: 0,
      },
      budget: { currentMonthRemaining: 0, nextMonthProjected: 0, nextMonthDays: 0 },
    };
    const viewModel = mapSafeToSpendViewModel(
      {
        summary: {
          ...engine.summary,
          safeDaysCount: null,
          totalFutureInflow: 1500,
          totalPlannedOutflow: 800,
          totalCommittedPlanned: 800,
        },
        explanation: engine.safeToSpendExplanation,
        asOf,
        report,
        totalLiquidAssets: cash,
        accountSummaries: [],
        liquidAssetSubtypes: [AccountSubtype.CASH],
        accountMap: new Map(),
        safeToSpendDays: 30,
      },
      { isLoading: false, currencyCode: 'USD' },
    );

    render(
      <SafeToSpendExplanationModal
        visible
        onClose={() => undefined}
        viewModel={viewModel}
        expandedSection={null}
        setExpandedSection={() => undefined}
      />,
    );
    return viewModel;
  };

  it('renders the same cash ceiling, binding rent date, held amount and later salary as the simulator', () => {
    expect(renderExplanation(1000).safeToSpend).toBe(200);

    const copy = AppConfig.strings.dashboard.safeToSpendConstraint;
    expect(screen.getByText(copy.cashAvailableNow)).toBeTruthy();
    expect(screen.getAllByText('USD 1000.00').length).toBeGreaterThan(0);
    expect(
      screen.getByText(copy.lowestProjectedBalance(formatDate(new Date(2026, 9, 5).getTime()))),
    ).toBeTruthy();
    expect(screen.getByText(copy.heldThroughLowPoint)).toBeTruthy();
    expect(screen.getByText(copy.laterIncomeNote)).toBeTruthy();
    expect(
      screen.getByText(copy.expectedInflow(formatDate(new Date(2026, 9, 20).getTime()))),
    ).toBeTruthy();
    expect(
      screen.getByText(AppConfig.strings.dashboard.safeToSpendExplanation.bucketTitle),
    ).toBeTruthy();
    expect(screen.getAllByText('–USD 800.00').length).toBeGreaterThan(0);
    // Salary (day 20) lands after rent (day 5): the result is the low point, not cash + income − bills.
    expect(screen.getAllByText('USD 200.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('USD 1700.00')).toBeNull();
    expect(
      screen.getByText(AppConfig.strings.dashboard.safeToSpendUi.remainingCashBuffer),
    ).toBeTruthy();
    const copyText = JSON.stringify([
      AppConfig.strings.dashboard.safeToSpendExplanation,
      AppConfig.strings.dashboard.safeToSpendUi,
      ONBOARDING_STRINGS.clarityCalculation,
    ]);
    expect(copyText).not.toMatch(
      /left over|\+ ?(expected )?income|incoming money|before next payday/i,
    );
  });

  it('shows a negative low point as a shortfall, not floored to zero', () => {
    const viewModel = renderExplanation(500);
    expect(viewModel.shortfall).toBe(300);
    expect(screen.getByText(AppConfig.strings.dashboard.shortfall)).toBeTruthy();
    expect(screen.getAllByText('–USD 300.00').length).toBeGreaterThan(0);
    expect(
      screen.getByText(AppConfig.strings.dashboard.safeToSpendConstraint.projectedShortfall),
    ).toBeTruthy();
  });
});
