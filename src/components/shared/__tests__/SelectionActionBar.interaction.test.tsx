import { SelectionActionBar } from '../SelectionActionBar';
import { getLayoutPath } from '@/src/testing/layoutAssertions';
import { Icon } from '@/src/types/domainIcons';
import { fireEvent, render } from '@/src/utils/test-utils';
import { View } from 'react-native';

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

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

it('preserves action slots across counts and prevents actions when no items are selected', () => {
  const onMerge = jest.fn();
  const props = {
    isVisible: true,
    totalCount: 3,
    onClear: jest.fn(),
    onSelectAll: jest.fn(),
    onDeselectAll: jest.fn(),
  };
  const view = render(
    <SelectionActionBar
      {...props}
      selectedCount={0}
      actions={[{ name: Icon.Merge, label: 'Merge', onPress: onMerge, disabled: false }]}
    />,
  );
  const original = getLayoutPath(view.getByLabelText('Merge'));
  fireEvent.press(view.getByLabelText('Merge'));
  expect(onMerge).not.toHaveBeenCalled();
  expect(view.getByRole('checkbox', { name: 'Toggle all' }).props.accessibilityState.checked).toBe(
    false,
  );
  const animation = view.UNSAFE_getAllByType(View).find(node => node.props.from);
  expect(animation?.props.from).toMatchObject({ scale: 1, translateY: 0 });

  view.rerender(
    <SelectionActionBar
      {...props}
      selectedCount={1}
      actions={[{ name: Icon.Merge, label: 'Merge', onPress: onMerge, disabled: true }]}
    />,
  );
  expect(getLayoutPath(view.getByLabelText('Merge'))).toEqual(original);
  expect(view.getByRole('checkbox', { name: 'Toggle all' }).props.accessibilityState.checked).toBe(
    'mixed',
  );
  fireEvent.press(view.getByLabelText('Merge'));
  expect(onMerge).not.toHaveBeenCalled();

  view.rerender(
    <SelectionActionBar
      {...props}
      selectedCount={3}
      actions={[{ name: Icon.Merge, label: 'Merge', onPress: onMerge, disabled: false }]}
    />,
  );
  expect(getLayoutPath(view.getByLabelText('Merge'))).toEqual(original);
  expect(view.getByRole('checkbox', { name: 'Toggle all' }).props.accessibilityState.checked).toBe(
    true,
  );
  fireEvent.press(view.getByLabelText('Merge'));
  expect(onMerge).toHaveBeenCalledTimes(1);
});
