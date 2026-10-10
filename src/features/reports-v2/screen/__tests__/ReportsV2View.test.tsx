import { RefreshControl } from 'react-native';
import { AppConfig } from '@/src/constants';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Icon } from '@/src/types/domainIcons';
import { act, fireEvent, render, screen, waitFor } from '@/src/utils/test-utils';
import { confirm, toast } from '@/src/utils/alerts';
import { fetchMissingHistoricalRates } from '@/src/services/reports-v2/missingExchangeRateFetch';
import type { MissingRateFetchResult } from '@/src/services/reports-v2/missingExchangeRateFetch';
import type { ReportsV2QueryEngine } from '@/src/services/reports-v2/reportQueryEngine';
import type { ReportsV2Query, ReportsV2Result } from '../../types';
import { ReportsV2View } from '../ReportsV2View';

jest.mock('react-native/Libraries/Animated/NativeAnimatedModule', () => {
  const { NativeModules } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: {
      ...NativeModules.NativeAnimatedModule,
      connectAnimatedNodeToShadowNodeFamily: jest.fn(),
    },
  };
});
jest.mock('@/src/components/account-selection', () => ({
  useAccounts: () => ({ accounts: [] }),
  MultiAccountPickerModal: () => null,
}));
jest.mock('@/src/components/filters/DateRangePicker', () => ({ DateRangePicker: () => null }));
jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
jest.mock('@/src/utils/alerts', () => ({
  confirm: {
    show: jest.fn((options: Parameters<typeof confirm.show>[0]) => options.onConfirm()),
  },
  toast: { info: jest.fn(), warning: jest.fn(), success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/src/services/reports-v2/missingExchangeRateFetch', () => ({
  fetchMissingHistoricalRates: jest.fn(),
}));

const quotes = [{ fromCurrency: 'USD', toCurrency: 'INR', rateDate: Date.UTC(2026, 8, 1) }];
const chrome: ScreenNavChrome = {
  screenTitle: 'Reports',
  showBack: true,
  backIcon: Icon.Back,
  onBack: jest.fn(),
};
const fetchLabel = AppConfig.strings.reportsV2.fetchMissingRates;

function resultFor(query: ReportsV2Query, missingRates = true): ReportsV2Result {
  return {
    kind: 'HEALTH',
    query,
    period: query.period,
    generatedAt: Date.now(),
    measures: {},
    sections: (query.sections ?? []).map(id => ({ id, title: id })),
    warnings: missingRates
      ? [
          {
            code: 'MISSING_EXCHANGE_RATE',
            severity: 'WARNING',
            message: 'omitted',
            missingRateQuotes: quotes,
          },
        ]
      : [],
  };
}

function engineMock(missingRates = true): jest.Mocked<ReportsV2QueryEngine> {
  return {
    run: jest.fn(async query => resultFor(query, missingRates)),
    drillDown: jest.fn(
      async (
        _query: Parameters<ReportsV2QueryEngine['drillDown']>[0],
      ): Promise<readonly string[]> => [],
    ),
  };
}

function renderReports(engine: ReportsV2QueryEngine) {
  return render(
    <ReportsV2View
      engine={engine}
      workplaceId="workplace-1"
      targetCurrency="INR"
      chrome={chrome}
    />,
  );
}

async function openHealth(engine: jest.Mocked<ReportsV2QueryEngine>) {
  await waitFor(() => expect(screen.getByText('overview')).toBeTruthy());
  fireEvent.press(screen.getByRole('tab', { name: 'Health' }));
  await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText('health')).toBeTruthy());
  await waitFor(() => expect(screen.getByRole('button', { name: fetchLabel })).toBeEnabled());
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(fetchMissingHistoricalRates)
    .mockResolvedValue({ attempted: 1, fetched: 1, failed: 0 });
});

it('only offers rate fetching on the health tab when quotes are missing', async () => {
  const engine = engineMock();
  renderReports(engine);
  await waitFor(() => expect(engine.run).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button', { name: fetchLabel })).toBeNull();
  await openHealth(engine);
  expect(screen.getByRole('button', { name: fetchLabel })).toBeEnabled();
});

it('does not offer fetching on the health tab when no quotes are missing', async () => {
  const engine = engineMock(false);
  renderReports(engine);
  await waitFor(() => expect(screen.getByText('overview')).toBeTruthy());
  fireEvent.press(screen.getByRole('tab', { name: 'Health' }));
  await waitFor(() => expect(screen.getByText('health')).toBeTruthy());
  expect(screen.queryByRole('button', { name: fetchLabel })).toBeNull();
});

it('fetches the omitted quotes once and disables the button until fetching finishes', async () => {
  const engine = engineMock();
  let finishFetch: (result: MissingRateFetchResult) => void = () => {
    throw new Error('Fetch has not started');
  };
  jest.mocked(fetchMissingHistoricalRates).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishFetch = resolve;
      }),
  );
  renderReports(engine);
  await openHealth(engine);
  fireEvent.press(screen.getByRole('button', { name: fetchLabel }));
  expect(confirm.show).toHaveBeenCalledTimes(1);
  expect(fetchMissingHistoricalRates).toHaveBeenCalledWith(quotes);
  expect(screen.getByRole('button', { name: fetchLabel })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: fetchLabel }));
  expect(fetchMissingHistoricalRates).toHaveBeenCalledTimes(1);
  await act(async () => finishFetch({ attempted: 1, fetched: 1, failed: 0 }));
  await waitFor(() => expect(screen.getByRole('button', { name: fetchLabel })).toBeEnabled());
  expect(toast.success).toHaveBeenCalled();
  expect(engine.run).toHaveBeenCalledTimes(3);
});

it('blocks fetching while the report refreshes and after that refresh fails', async () => {
  const engine = engineMock();
  renderReports(engine);
  await openHealth(engine);
  let rejectRefresh: (reason: Error) => void = () => {
    throw new Error('Refresh has not started');
  };
  engine.run.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectRefresh = reject;
      }),
  );
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  expect(screen.getByRole('button', { name: fetchLabel })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: fetchLabel }));
  expect(fetchMissingHistoricalRates).not.toHaveBeenCalled();
  await act(async () => rejectRefresh(new Error('offline')));
  expect(screen.getByText('Report update failed')).toBeTruthy();
  expect(screen.getByRole('button', { name: fetchLabel })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: fetchLabel }));
  expect(fetchMissingHistoricalRates).not.toHaveBeenCalled();
});
