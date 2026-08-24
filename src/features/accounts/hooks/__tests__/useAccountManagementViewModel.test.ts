import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccountType } from '@/src/types/enums';
import { type AccountFields } from '@/src/types/plainDtos';
import { type AccountId } from '@/src/types/ids';
import { useAccountManagementViewModel } from '../useAccountManagementViewModel';
import { confirm, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { saveAccountTreeDraft } from '@/src/services/accounts/accountHierarchyCommands';

const firstId = 'first' as AccountId;
const secondId = 'second' as AccountId;
const mockAccounts: AccountFields[] = [
  {
    id: firstId,
    name: 'First',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    orderNum: 0,
  },
  {
    id: secondId,
    name: 'Second',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    orderNum: 1,
  },
];

const mockDispatch = jest.fn();
let mockPreventRemove: boolean | undefined;
let mockPreventRemoveCallback:
  ((event: { data: { action: { type: string } } }) => void) | undefined;

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace', defaultCurrencyCode: 'USD' }),
}));

jest.mock('@/src/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: mockAccounts, isLoading: false }),
  useAccountBalances: () => ({
    balancesByAccountId: new Map(
      mockAccounts.map(account => [account.id, { directTransactionCount: 0 }]),
    ),
  }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ filterMode: 'accounts' }),
  useNavigation: () => ({ dispatch: mockDispatch }),
}));

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (
    enabled: boolean,
    callback: (event: { data: { action: { type: string } } }) => void,
  ) => {
    mockPreventRemove = enabled;
    mockPreventRemoveCallback = callback;
  },
}));

jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    back: jest.fn(),
    toAccountCreation: jest.fn(),
    toCategoryCreation: jest.fn(),
  },
}));

jest.mock('@/src/services/accounts/accountHierarchyCommands', () => ({
  saveAccountTreeDraft: jest.fn().mockResolvedValue(undefined),
}));

function stageMove(result: { current: ReturnType<typeof useAccountManagementViewModel> }) {
  act(() => {
    result.current.onDrop({
      accountId: firstId,
      parentId: null,
      siblingIndex: 2,
      kind: 'sibling-after',
      anchorAccountId: secondId,
    });
  });
}

function latestConfirm() {
  return (confirm.show as jest.Mock).mock.calls.at(-1)?.[0] as { onConfirm: () => void };
}

describe('useAccountManagementViewModel draft lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreventRemove = undefined;
    mockPreventRemoveCallback = undefined;
    (saveAccountTreeDraft as jest.Mock).mockResolvedValue(undefined);
  });

  it('enters structural editing only through Organize mode', async () => {
    const { result } = renderHook(() => useAccountManagementViewModel());
    await waitFor(() => expect(result.current.treeRows).toHaveLength(2));

    expect(result.current.isOrganizing).toBe(false);
    act(() => result.current.onToggleOrganize());
    expect(result.current.isOrganizing).toBe(true);
  });

  it('saves the staged tree and clears the leave guard', async () => {
    const { result } = renderHook(() => useAccountManagementViewModel());
    await waitFor(() => expect(result.current.treeRows).toHaveLength(2));
    stageMove(result);

    expect(result.current.isDraftDirty).toBe(true);
    expect(mockPreventRemove).toBe(true);

    await act(async () => {
      await result.current.onSaveDraft();
    });

    expect(saveAccountTreeDraft).toHaveBeenCalledTimes(1);
    expect(result.current.isDraftDirty).toBe(false);
    expect(mockPreventRemove).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('Account hierarchy saved');
  });

  it('keeps the draft and leave guard when save fails', async () => {
    (saveAccountTreeDraft as jest.Mock).mockRejectedValueOnce(new Error('write failed'));
    const { result } = renderHook(() => useAccountManagementViewModel());
    await waitFor(() => expect(result.current.treeRows).toHaveLength(2));
    stageMove(result);

    await act(async () => {
      await result.current.onSaveDraft();
    });

    expect(result.current.isDraftDirty).toBe(true);
    expect(mockPreventRemove).toBe(true);
    expect(toast.error).toHaveBeenCalledWith('write failed');
  });

  it('discards before running the screen back action', async () => {
    const { result } = renderHook(() => useAccountManagementViewModel());
    await waitFor(() => expect(result.current.treeRows).toHaveLength(2));
    stageMove(result);

    act(() => result.current.onBack());
    expect(AppNavigation.back).not.toHaveBeenCalled();

    act(() => latestConfirm().onConfirm());
    await waitFor(() => expect(AppNavigation.back).toHaveBeenCalledTimes(1));
    expect(result.current.isDraftDirty).toBe(false);
  });

  it('waits for the native move sheet to dismiss before prompting', async () => {
    const { result } = renderHook(() => useAccountManagementViewModel());
    await waitFor(() => expect(result.current.treeRows).toHaveLength(2));
    stageMove(result);
    act(() => result.current.onSelectAccount(firstId));

    act(() => result.current.onBack());
    expect(confirm.show).not.toHaveBeenCalled();
    expect(result.current.selectedAccountId).toBeNull();

    act(() => result.current.onMoveModalDismiss());
    expect(confirm.show).toHaveBeenCalledTimes(1);

    act(() => latestConfirm().onConfirm());
    await waitFor(() => expect(AppNavigation.back).toHaveBeenCalledTimes(1));
  });

  it('replays a prevented navigation action only after discard', async () => {
    const { result } = renderHook(() => useAccountManagementViewModel());
    await waitFor(() => expect(result.current.treeRows).toHaveLength(2));
    stageMove(result);
    const action = { type: 'GO_BACK' };

    act(() => mockPreventRemoveCallback?.({ data: { action } }));
    expect(mockDispatch).not.toHaveBeenCalled();

    act(() => latestConfirm().onConfirm());
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(action));
    expect(result.current.isDraftDirty).toBe(false);
  });
});
