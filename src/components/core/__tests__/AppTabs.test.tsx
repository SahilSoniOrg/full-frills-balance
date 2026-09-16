import { AppTabs } from '@/src/components/core/AppTabs';
import { triggerHaptic } from '@/src/utils/haptics';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

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
});
