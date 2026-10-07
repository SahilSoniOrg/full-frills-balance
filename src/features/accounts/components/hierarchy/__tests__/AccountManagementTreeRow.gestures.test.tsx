import { act, fireEvent, render } from '@/src/utils/test-utils';
import { useSharedValue } from 'react-native-reanimated';
import { useTheme } from '@/src/hooks/use-theme';
import { asAccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { panGestures } from '@/src/testing/gestureMock';
import { AccountManagementTreeRow } from '../AccountManagementTreeRow';

jest.mock('react-native-gesture-handler', () => ({
  Gesture: jest.requireActual('@/src/testing/gestureMock').Gesture,
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

function Fixture({
  onFinish,
  onCancel,
  onMoveDown,
}: {
  onFinish: () => void;
  onCancel: () => void;
  onMoveDown?: () => void;
}) {
  const { theme } = useTheme();
  const dragMotion = {
    translationY: useSharedValue(0),
    scrollDelta: useSharedValue(0),
    liftProgress: useSharedValue(0),
  };
  return (
    <AccountManagementTreeRow
      account={{
        id: asAccountId('first'),
        name: 'First',
        accountType: AccountType.ASSET,
        currencyCode: 'INR',
      }}
      row={{ accountId: asAccountId('first'), depth: 0, childCount: 0, isExpanded: false }}
      isOrganizing
      isPending={false}
      isActive={false}
      isFlashing={false}
      isActiveSubtree={false}
      dragMotion={dragMotion}
      makeRoomOffset={0}
      dropIntent={null}
      theme={theme}
      onBegin={jest.fn()}
      onUpdate={jest.fn()}
      onFinish={onFinish}
      onCancel={onCancel}
      onPress={jest.fn()}
      onChooseGroup={jest.fn()}
      onToggleTypeSection={jest.fn()}
      onLayout={jest.fn()}
      onMoveDown={onMoveDown}
    />
  );
}

beforeEach(() => {
  panGestures.length = 0;
});

it('does not finish a cancelled active drag or cancel a drag that never started', () => {
  const onFinish = jest.fn();
  const onCancel = jest.fn();
  render(<Fixture onFinish={onFinish} onCancel={onCancel} />);
  const pan = panGestures.at(-1)!;
  act(() => pan.handlers.onFinalize?.({}, false));
  expect(onCancel).not.toHaveBeenCalled();
  act(() => {
    pan.handlers.onStart?.({}, true);
    pan.handlers.onEnd?.({}, false);
    pan.handlers.onFinalize?.({}, false);
  });
  expect(onFinish).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('exposes ordering buttons and disables a move past the first sibling', () => {
  const onMoveDown = jest.fn();
  const screen = render(
    <Fixture onFinish={jest.fn()} onCancel={jest.fn()} onMoveDown={onMoveDown} />,
  );
  expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Move First down' }));
  expect(onMoveDown).toHaveBeenCalledTimes(1);
});
