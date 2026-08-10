import { act, renderHook } from '@testing-library/react-native';
import Account from '@/src/data/models/Account';
import { useAccountDeleteMergeActions } from '@/src/features/accounts/hooks/useAccountDeleteMergeActions';
import { AccountId, AccountType } from '@/src/types/domain';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';

jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
  showErrorAlert: jest.fn(),
  toast: {
    success: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    toAccounts: jest.fn(),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

describe('useAccountDeleteMergeActions', () => {
  const accountId = 'source' as AccountId;
  const targetId = 'target' as AccountId;

  const sourceAccount = {
    id: accountId,
    name: 'Source Account',
    accountType: AccountType.ASSET,
    accountSubtype: 'CHECKING',
    currencyCode: 'USD',
    deletedAt: null,
  } as unknown as Account;

  const targetAccount = {
    id: targetId,
    name: 'Target Account',
    accountType: AccountType.ASSET,
    accountSubtype: 'CHECKING',
    currencyCode: 'USD',
    deletedAt: null,
  } as unknown as Account;

  const deleteAccount = jest.fn().mockResolvedValue(undefined);
  const recoverAction = jest.fn().mockResolvedValue(undefined);
  const mergeAccounts = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes delete when enabled with no transactions', () => {
    const { result } = renderHook(() =>
      useAccountDeleteMergeActions({
        accountId,
        account: sourceAccount,
        accounts: [sourceAccount, targetAccount],
        transactionCount: 0,
        isDeleted: false,
        enabled: true,
        entityLabel: 'Account',
        deleteAccount,
        recoverAction,
        mergeAccounts,
      }),
    );

    expect(result.current.destructiveAction).toMatchObject({
      label: 'Delete Account',
      testID: 'delete-button',
    });
    expect(result.current.canMerge).toBe(false);
  });

  it('exposes merge when enabled with transactions', () => {
    const { result } = renderHook(() =>
      useAccountDeleteMergeActions({
        accountId,
        account: sourceAccount,
        accounts: [sourceAccount, targetAccount],
        transactionCount: 3,
        isDeleted: false,
        enabled: true,
        entityLabel: 'Account',
        deleteAccount,
        recoverAction,
        mergeAccounts,
      }),
    );

    expect(result.current.destructiveAction).toMatchObject({
      label: 'Merge Account',
      testID: 'merge-button',
    });
    expect(result.current.canMerge).toBe(true);
    expect(result.current.mergeCandidates).toEqual([targetAccount]);
  });

  it('shows a toast when merge has no eligible targets', () => {
    const { result } = renderHook(() =>
      useAccountDeleteMergeActions({
        accountId,
        account: sourceAccount,
        accounts: [sourceAccount],
        transactionCount: 2,
        isDeleted: false,
        enabled: true,
        entityLabel: 'Account',
        deleteAccount,
        recoverAction,
        mergeAccounts,
      }),
    );

    act(() => result.current.destructiveAction?.onPress());

    expect(toast.info).toHaveBeenCalledWith('No eligible accounts found to merge into.');
    expect(result.current.isMergeModalVisible).toBe(false);
  });

  it('opens the merge modal when candidates exist', () => {
    const { result } = renderHook(() =>
      useAccountDeleteMergeActions({
        accountId,
        account: sourceAccount,
        accounts: [sourceAccount, targetAccount],
        transactionCount: 2,
        isDeleted: false,
        enabled: true,
        entityLabel: 'Account',
        deleteAccount,
        recoverAction,
        mergeAccounts,
      }),
    );

    act(() => result.current.destructiveAction?.onPress());

    expect(result.current.isMergeModalVisible).toBe(true);
  });

  it('deletes the account and navigates away on confirm', async () => {
    const { result } = renderHook(() =>
      useAccountDeleteMergeActions({
        accountId,
        account: sourceAccount,
        accounts: [sourceAccount],
        transactionCount: 0,
        isDeleted: false,
        enabled: true,
        entityLabel: 'Account',
        deleteAccount,
        recoverAction,
        mergeAccounts,
      }),
    );

    act(() => result.current.destructiveAction?.onPress());

    const confirmCall = (confirm.show as jest.Mock).mock.calls[0][0];
    await act(async () => {
      await confirmCall.onConfirm();
    });

    expect(deleteAccount).toHaveBeenCalledWith(sourceAccount);
    expect(toast.success).toHaveBeenCalledWith('Account has been deleted.', expect.any(Object));
    expect(AppNavigation.toAccounts).toHaveBeenCalled();
  });

  it('restores the account when undo is pressed after delete', async () => {
    const { result } = renderHook(() =>
      useAccountDeleteMergeActions({
        accountId,
        account: sourceAccount,
        accounts: [sourceAccount],
        transactionCount: 0,
        isDeleted: false,
        enabled: true,
        entityLabel: 'Account',
        deleteAccount,
        recoverAction,
        mergeAccounts,
      }),
    );

    act(() => result.current.destructiveAction?.onPress());

    const confirmCall = (confirm.show as jest.Mock).mock.calls[0][0];
    await act(async () => {
      await confirmCall.onConfirm();
    });

    const toastCall = (toast.success as jest.Mock).mock.calls[0];
    const undoAction = toastCall[1].action;
    await act(async () => {
      await undoAction.onPress();
    });

    expect(recoverAction).toHaveBeenCalledWith(accountId);
    expect(toast.success).toHaveBeenCalledWith('Account restored.');
  });

  it('merges into the selected account on confirm', async () => {
    const { result } = renderHook(() =>
      useAccountDeleteMergeActions({
        accountId,
        account: sourceAccount,
        accounts: [sourceAccount, targetAccount],
        transactionCount: 2,
        isDeleted: false,
        enabled: true,
        entityLabel: 'Account',
        deleteAccount,
        recoverAction,
        mergeAccounts,
      }),
    );

    await act(async () => {
      await result.current.onConfirmMerge(targetId);
    });

    const confirmCall = (confirm.show as jest.Mock).mock.calls[0][0];
    await act(async () => {
      await confirmCall.onConfirm();
    });

    expect(mergeAccounts).toHaveBeenCalledWith(targetId, [accountId]);
    expect(toast.success).toHaveBeenCalledWith('Successfully merged into Target Account');
    expect(AppNavigation.toAccounts).toHaveBeenCalled();
  });

  it('reports merge failures', async () => {
    mergeAccounts.mockRejectedValueOnce(new Error('db locked'));

    const { result } = renderHook(() =>
      useAccountDeleteMergeActions({
        accountId,
        account: sourceAccount,
        accounts: [sourceAccount, targetAccount],
        transactionCount: 2,
        isDeleted: false,
        enabled: true,
        entityLabel: 'Account',
        deleteAccount,
        recoverAction,
        mergeAccounts,
      }),
    );

    await act(async () => {
      await result.current.onConfirmMerge(targetId);
    });

    const confirmCall = (confirm.show as jest.Mock).mock.calls[0][0];
    await act(async () => {
      await confirmCall.onConfirm();
    });

    expect(showErrorAlert).toHaveBeenCalledWith('Merge failed: db locked');
  });
});
