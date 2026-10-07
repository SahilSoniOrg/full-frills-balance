import { act, renderHook } from '@testing-library/react-native';
import { cancelAnimation, withSpring, withTiming } from 'react-native-reanimated';
import { asAccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { createAccountTreeSnapshot } from '@/src/services/accounts/accountTree';
import { flattenAccountTree } from '@/src/services/accounts/accountTreeProjection';
import { useAccountTreeDragController } from '../useAccountTreeDragController';

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
jest.mock('@/src/utils/haptics', () => ({ triggerHaptic: jest.fn() }));

const first = asAccountId('first');
const second = asAccountId('second');
const accounts = [
  { id: first, name: 'First', accountType: AccountType.ASSET, currencyCode: 'INR', orderNum: 0 },
  { id: second, name: 'Second', accountType: AccountType.ASSET, currencyCode: 'INR', orderNum: 1 },
];
const rows = flattenAccountTree(createAccountTreeSnapshot(accounts));
const balancesByAccountId = new Map(
  accounts.map(account => [account.id, { directTransactionCount: 0 }]),
);

it('cancels immediately without lift or settle animation under reduced motion', () => {
  const onDrop = jest.fn();
  const { result, unmount } = renderHook(() =>
    useAccountTreeDragController({ accounts, rows, balancesByAccountId, onDrop }),
  );
  act(() => result.current.beginDrag(first));
  expect(result.current.activeAccountId).toBe(first);
  act(() => result.current.cancelDrag());
  expect(result.current.activeAccountId).toBeNull();
  expect(withSpring).not.toHaveBeenCalled();
  expect(withTiming).not.toHaveBeenCalled();
  expect(onDrop).not.toHaveBeenCalled();
  unmount();
  expect(cancelAnimation).toHaveBeenCalled();
});

it('stages a valid drop once without waiting for an animation under reduced motion', () => {
  const onDrop = jest.fn();
  const { result } = renderHook(() =>
    useAccountTreeDragController({ accounts, rows, balancesByAccountId, onDrop }),
  );
  act(() => result.current.beginDrag(first));
  act(() => result.current.updateDrag(first, 120, 500));
  expect(result.current.hover?.target).not.toBeNull();
  act(() => result.current.finishDrag());
  expect(onDrop).toHaveBeenCalledTimes(1);
  expect(result.current.activeAccountId).toBeNull();
  expect(withSpring).not.toHaveBeenCalled();
});
