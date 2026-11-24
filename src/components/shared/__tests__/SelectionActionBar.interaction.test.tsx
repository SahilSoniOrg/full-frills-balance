import { SelectionActionBar } from '../SelectionActionBar';
import { getLayoutPath } from '@/src/testing/layoutAssertions';
import { Icon } from '@/src/types/domainIcons';
import { fireEvent, render } from '@/src/testing/render';
import { View } from 'react-native';
import { getSelectionState } from '@/src/hooks/selectionState';

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
    onClear: jest.fn(),
    onSelectAll: jest.fn(),
    onDeselectAll: jest.fn(),
  };
  const view = render(
    <SelectionActionBar
      {...props}
      selection={getSelectionState(new Set<string>(), ['1', '2', '3'])}
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
      selection={getSelectionState(new Set(['1']), ['1', '2', '3'])}
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
      selection={getSelectionState(new Set(['1', '2', '3']), ['1', '2', '3'])}
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

it('selects visible items when a different hidden item is selected', () => {
  const onSelectAll = jest.fn();
  const onDeselectAll = jest.fn();
  const view = render(
    <SelectionActionBar
      isVisible
      selection={getSelectionState(new Set(['hidden']), ['visible'])}
      onClear={jest.fn()}
      onSelectAll={onSelectAll}
      onDeselectAll={onDeselectAll}
    />,
  );

  const toggle = view.getByRole('checkbox', { name: 'Toggle all' });
  expect(toggle.props.accessibilityState.checked).toBe(false);
  fireEvent.press(toggle);
  expect(onSelectAll).toHaveBeenCalledTimes(1);
  expect(onDeselectAll).not.toHaveBeenCalled();
});
