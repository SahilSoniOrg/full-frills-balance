import { AppTabs } from '@/src/components/core/AppTabs';
import { Spacing } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { triggerHaptic } from '@/src/utils/haptics';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { ScrollView } from 'react-native';

jest.mock('@/src/utils/haptics', () => ({
  triggerHaptic: jest.fn(),
}));

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

const OPTIONS = [
  { id: 'budgets', label: 'Budgets' },
  { id: 'bills', label: 'Bills' },
] as const;

describe('AppTabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('renders tabs and calls onChange with light haptic when selection changes', () => {
    const onChange = jest.fn();
    render(<AppTabs options={OPTIONS} value="budgets" onChange={onChange} testID="commitments" />);

    fireEvent.press(screen.getByTestId('commitments-item-bills'));

    expect(triggerHaptic).toHaveBeenCalledWith('light');
    expect(onChange).toHaveBeenCalledWith('bills');
  });

  it('does not haptic or onChange when pressing the selected tab', () => {
    const onChange = jest.fn();
    render(<AppTabs options={OPTIONS} value="budgets" onChange={onChange} testID="commitments" />);

    fireEvent.press(screen.getByTestId('commitments-item-budgets'));

    expect(triggerHaptic).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the underline indicator after layout', () => {
    render(<AppTabs options={OPTIONS} value="budgets" onChange={jest.fn()} testID="commitments" />);

    fireEvent(screen.getByTestId('commitments-item-budgets'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 80, height: 40 } },
    });

    expect(screen.getByTestId('commitments-indicator')).toBeTruthy();
  });

  it('scrolls the selected tab into view after layout', () => {
    const scrollTo = jest.fn();
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(scrollTo);

    render(<AppTabs options={OPTIONS} value="bills" onChange={jest.fn()} testID="commitments" />);

    fireEvent(screen.getByTestId('commitments-scroll'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 44 } },
    });
    fireEvent(screen.getByTestId('commitments-item-bills'), 'layout', {
      nativeEvent: { layout: { x: 120, y: 0, width: 80, height: 40 } },
    });

    const tabLeftInContent = Spacing.lg + 120;
    const centeredOffset = tabLeftInContent - (200 - 80) / 2;
    expect(scrollTo).toHaveBeenCalledWith({
      x: Math.max(0, centeredOffset),
      animated: true,
    });

    scrollToSpy.mockRestore();
  });

  it('scrolls without animation when reduce motion is enabled', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const scrollTo = jest.fn();
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(scrollTo);

    render(<AppTabs options={OPTIONS} value="bills" onChange={jest.fn()} testID="commitments" />);

    fireEvent(screen.getByTestId('commitments-scroll'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 44 } },
    });
    fireEvent(screen.getByTestId('commitments-item-bills'), 'layout', {
      nativeEvent: { layout: { x: 120, y: 0, width: 80, height: 40 } },
    });

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ animated: false }));

    scrollToSpy.mockRestore();
  });
});
