import { AppConfig } from '@/src/constants';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { ReportsV2MissingRatesAction } from '../ReportsV2MissingRatesAction';

describe('ReportsV2MissingRatesAction', () => {
  it('offers a fetch action for omitted exchange rates', () => {
    const onPress = jest.fn();
    render(<ReportsV2MissingRatesAction onPress={onPress} loading={false} disabled={false} />);
    fireEvent.press(screen.getByText(AppConfig.strings.reportsV2.fetchMissingRates));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
