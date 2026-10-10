import { AppSegmentedControl } from '@/src/components/core/AppSegmentedControl';
import { triggerPressHaptic } from '@/src/utils/haptics';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/utils/haptics', () => ({
  triggerPressHaptic: jest.fn(),
}));

const OPTIONS = [
  { id: 'simple', label: 'Simple' },
  { id: 'split', label: 'Split' },
] as const;

describe('AppSegmentedControl haptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fires selection haptic when selection changes', () => {
    const onChange = jest.fn();
    render(
      <AppSegmentedControl options={OPTIONS} value="simple" onChange={onChange} testID="mode" />,
    );

    fireEvent.press(screen.getByTestId('mode-item-split'));

    expect(triggerPressHaptic).toHaveBeenCalledWith('selection');
    expect(onChange).toHaveBeenCalledWith('split');
  });

  it('skips haptic when pressing the active segment', () => {
    const onChange = jest.fn();
    render(
      <AppSegmentedControl options={OPTIONS} value="simple" onChange={onChange} testID="mode" />,
    );

    fireEvent.press(screen.getByTestId('mode-item-simple'));

    expect(triggerPressHaptic).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
