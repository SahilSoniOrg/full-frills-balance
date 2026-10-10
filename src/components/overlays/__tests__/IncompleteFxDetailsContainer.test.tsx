import { AppConfig } from '@/src/constants';
import { fetchMissingHistoricalRates } from '@/src/services/reports-v2/missingExchangeRateFetch';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';
import { act, fireEvent, render, screen, waitFor } from '@/src/utils/test-utils';
import { IncompleteFxDetailsContainer } from '../IncompleteFxDetailsContainer';

jest.mock('react-native/src/private/animated/NativeAnimatedHelper');
jest.mock('@/src/services/reports-v2/missingExchangeRateFetch', () => ({
  fetchMissingHistoricalRates: jest.fn(async () => ({ attempted: 1, fetched: 1, failed: 0 })),
}));
jest.mock('@/src/utils/alerts', () => ({
  ...jest.requireActual('@/src/utils/alerts'),
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const fetchLabel = AppConfig.strings.reportsV2.fetchMissingRates;
const quote = { fromCurrency: 'EUR', toCurrency: 'USD', rateDate: Date.UTC(2026, 9, 3) };

describe('IncompleteFxDetailsContainer', () => {
  it('offers Fetch missing rates for historical quotes and closes once rates arrive', async () => {
    render(<IncompleteFxDetailsContainer />);
    act(() =>
      showIncompleteFxDetails({
        context: 'budget',
        currencyCode: 'USD',
        missingRateQuotes: [quote],
      }),
    );
    fireEvent.press(screen.getByText(fetchLabel));
    await waitFor(() => expect(fetchMissingHistoricalRates).toHaveBeenCalledWith([quote]));
    await waitFor(() => expect(screen.queryByText(fetchLabel)).toBeNull());
  });

  it('keeps the sheet read-only when nothing needs a historical rate', () => {
    render(<IncompleteFxDetailsContainer />);
    act(() => showIncompleteFxDetails({ context: 'budget', currencyCode: 'USD' }));
    expect(screen.queryByText(fetchLabel)).toBeNull();
  });
});
