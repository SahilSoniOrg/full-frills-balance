import { fireEvent, render } from '@/src/utils/test-utils';
import { JournalEntryListView } from '../JournalEntryListView';
import { AppConfig } from '@/src/constants';

jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));

describe('JournalEntryListView failures', () => {
  it('shows retry instead of an empty result until the read recovers', () => {
    const retry = jest.fn();
    const view = render(
      <JournalEntryListView
        items={[]}
        error={new Error('Read failed')}
        retry={retry}
        emptyTitle="No matching entries"
      />,
    );

    expect(view.getByText(AppConfig.strings.common.listLoadError)).toBeTruthy();
    expect(view.queryByText('No matching entries')).toBeNull();
    fireEvent.press(view.getByLabelText(AppConfig.strings.common.retry));
    expect(retry).toHaveBeenCalledTimes(1);

    view.rerender(
      <JournalEntryListView
        items={[]}
        error={null}
        retry={retry}
        emptyTitle="No matching entries"
      />,
    );
    expect(view.getByText('No matching entries')).toBeTruthy();
    expect(view.queryByText(AppConfig.strings.common.listLoadError)).toBeNull();
  });
});
