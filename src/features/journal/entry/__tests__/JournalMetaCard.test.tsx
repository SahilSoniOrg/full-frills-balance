import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import { createRef, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
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

  it('clears the description without letting the page blur it, then accepts more typing', () => {
    const descriptionInputRef = createRef<TextInput>();
    const onOutsideTouch = jest.fn();
    function Entry() {
      const [description, setDescription] = useState('Lunch');
      const interacting = useRef(false);
      return (
        <View
          testID="entry-page"
          onTouchStart={() => {
            if (interacting.current) return;
            onOutsideTouch();
            descriptionInputRef.current?.blur();
          }}
        >
          <JournalMetaCard
            description={description}
            setDescription={setDescription}
            date="2026-09-28"
            setDate={jest.fn()}
            time="12:00"
            setTime={jest.fn()}
            descriptionInputRef={descriptionInputRef}
            onSuggestionInteractionChange={value => {
              interacting.current = value;
            }}
          />
        </View>
      );
    }
    render(<Entry />);
    const input = screen.getByTestId('journal-description-input');
    fireEvent(input, 'focus');
    const focus = jest.spyOn(descriptionInputRef.current!, 'focus');
    const blur = jest.spyOn(descriptionInputRef.current!, 'blur');
    const clear = screen.getByTestId('clear-description-button');
    fireEvent(clear, 'touchStart');
    // fireEvent does not bubble: reproduce the child's touch reaching the page.
    fireEvent(screen.getByTestId('entry-page'), 'touchStart');
    expect(blur).not.toHaveBeenCalled();
    fireEvent(clear, 'touchEnd');
    fireEvent.press(clear);
    expect(input.props.value).toBe('');
    expect(screen.queryByTestId('clear-description-button')).toBeNull();
    expect(focus).toHaveBeenCalled();
    fireEvent.changeText(input, 'Dinner');
    expect(input.props.value).toBe('Dinner');
    fireEvent(screen.getByTestId('entry-page'), 'touchStart');
    expect(onOutsideTouch).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('releases field interaction protection when a clear-button touch is cancelled', () => {
    const setDescription = jest.fn();
    const onSuggestionInteractionChange = jest.fn();
    renderSuggestions({ setDescription, onSuggestionInteractionChange });
    const clear = screen.getByTestId('clear-description-button');
    fireEvent(clear, 'touchStart');
    expect(onSuggestionInteractionChange).toHaveBeenLastCalledWith(true);
    fireEvent(clear, 'touchCancel');
    expect(onSuggestionInteractionChange).toHaveBeenLastCalledWith(false);
    expect(setDescription).not.toHaveBeenCalled();
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
