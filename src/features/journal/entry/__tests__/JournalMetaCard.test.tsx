import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import { ScrollView } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { JournalMetaCard, type JournalMetaCardProps } from '../components/JournalMetaCard';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';

jest.mock('@/src/components/filters/DateTimePickerModal', () => ({
  DateTimePickerModal: () => null,
}));

const accounts = [
  { id: asAccountId('cash'), name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
  { id: asAccountId('food'), name: 'Food', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
];
const suggestion = {
  key: 'lunch',
  description: 'Lunch',
  route: {
    sources: [{ id: accounts[0].id, name: 'Cash', type: AccountType.ASSET }],
    destinations: [{ id: accounts[1].id, name: 'Food', type: AccountType.EXPENSE }],
  },
  history: { count: 1, lastUsedAt: 1 },
};

describe('JournalMetaCard suggestions', () => {
  beforeAll(() => {
    // The shared gesture-handler mock omits the native state enum.
    Object.assign(State, jest.requireActual('react-native-gesture-handler/src/State').State);
  });
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function renderSuggestions(overrides: Partial<JournalMetaCardProps> = {}) {
    render(
      <JournalMetaCard
        description="Lu"
        setDescription={jest.fn()}
        date="2026-09-28"
        setDate={jest.fn()}
        time="12:00"
        setTime={jest.fn()}
        accounts={accounts}
        activeTabType="expense"
        suggestions={[suggestion]}
        suggestionState="results"
        {...overrides}
      />,
    );
    fireEvent(screen.getByTestId('journal-description-input'), 'focus');
    return screen.UNSAFE_getByType(ScrollView);
  }

  it('keeps suggestions visible when a dropdown drag blurs the description', () => {
    const dropdown = renderSuggestions();
    fireEvent(dropdown, 'touchStart');
    fireEvent(screen.getByTestId('journal-description-input'), 'blur');
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByText('Lunch')).toBeTruthy();
    fireEvent(dropdown, 'touchEnd');
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByText('Lunch')).toBeTruthy();
  });

  it('dismisses suggestions when the description loses focus outside the dropdown', () => {
    renderSuggestions();
    fireEvent(screen.getByTestId('journal-description-input'), 'blur');
    act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByText('Lunch')).toBeNull();
  });

  it('keeps a native scroll protected after it cancels the JavaScript touch responder', () => {
    const onSuggestionInteractionChange = jest.fn();
    const dropdown = renderSuggestions({ onSuggestionInteractionChange });
    fireEvent(dropdown, 'touchStart');
    fireEvent(dropdown, 'scrollBeginDrag', { nativeEvent: {} });
    fireEvent(dropdown, 'touchCancel');
    expect(onSuggestionInteractionChange).toHaveBeenLastCalledWith(true);
    fireEvent(screen.getByTestId('journal-description-input'), 'blur');
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByText('Lunch')).toBeTruthy();
    fireEvent(dropdown, 'scrollEndDrag', { nativeEvent: {} });
    expect(onSuggestionInteractionChange).toHaveBeenLastCalledWith(false);
  });

  it('releases protection when the native gesture itself is cancelled without a drag-end event', () => {
    const onSuggestionInteractionChange = jest.fn();
    const dropdown = renderSuggestions({ onSuggestionInteractionChange });
    fireEvent(dropdown, 'touchStart');
    fireEvent(dropdown, 'scrollBeginDrag', { nativeEvent: {} });
    fireEvent(dropdown, 'touchCancel');
    fireEvent(dropdown, 'handlerStateChange', { nativeEvent: { state: State.CANCELLED } });
    expect(onSuggestionInteractionChange).toHaveBeenLastCalledWith(false);
    fireEvent(screen.getByTestId('journal-description-input'), 'blur');
    act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByText('Lunch')).toBeNull();
  });
});
