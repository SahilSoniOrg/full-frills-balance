import { IconButton } from '../IconButton';
import { Icon } from '@/src/types/domainIcons';
import { fireEvent, render } from '@/src/utils/test-utils';

describe('IconButton accessibility', () => {
  it('honors an explicit checkbox role and mixed selection state', () => {
    const { getByRole } = render(
      <IconButton
        name={Icon.MinusSquare}
        accessibilityRole="checkbox"
        accessibilityLabel="Select all"
        accessibilityState={{ checked: 'mixed' }}
      />,
    );
    expect(getByRole('checkbox', { name: 'Select all' }).props.accessibilityState.checked).toBe(
      'mixed',
    );
  });
  it('announces the supplied expansion state while retaining its press action', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <IconButton
        name={Icon.ChevronUp}
        accessibilityLabel="Collapse sub-accounts"
        accessibilityState={{ expanded: true }}
        onPress={onPress}
      />,
    );
    const button = getByRole('button', { name: 'Collapse sub-accounts' });
    expect(button.props.accessibilityState.expanded).toBe(true);
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('preserves expansion state when disabled and prevents the action', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <IconButton
        name={Icon.ChevronRight}
        accessibilityLabel="Expand sub-accounts"
        accessibilityState={{ expanded: false }}
        disabled
        onPress={onPress}
      />,
    );
    const button = getByRole('button', { name: 'Expand sub-accounts' });
    expect(button.props.accessibilityState).toMatchObject({ expanded: false, disabled: true });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
