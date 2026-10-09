import { act, renderHook } from '@testing-library/react-native';
import {
  useAccountDeleteMergeActions,
  type UseAccountDeleteMergeActionsOptions,
} from '@/src/features/accounts/hooks/useAccountDeleteMergeActions';
import { createAccountTreeSnapshot } from '@/src/services/accounts/accountTree';
import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { type AccountFields } from '@/src/types/plainDtos';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { Icon } from '@/src/types/domainIcons';
import { AllTheProviders } from '@/src/utils/test-utils';

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
    afterAccountRemoval: jest.fn(),
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
  } as unknown as AccountFields;

  const targetAccount = {
    id: targetId,
    name: 'Target Account',
    accountType: AccountType.ASSET,
    accountSubtype: 'CHECKING',
    currencyCode: 'USD',
    deletedAt: null,
  } as unknown as AccountFields;

  const deleteAccount = jest.fn().mockResolvedValue(undefined);
  const recoverAction = jest.fn().mockResolvedValue(undefined);
  const mergeAccounts = jest.fn().mockResolvedValue(undefined);
  const disbandGroup = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  type Options = Omit<UseAccountDeleteMergeActionsOptions, 'tree'>;
  const withTree = (options: Options): UseAccountDeleteMergeActionsOptions => ({
    ...options,
    tree: createAccountTreeSnapshot(options.accounts),
  });
  const renderActionsHook = (options: Options) =>
    renderHook(() => useAccountDeleteMergeActions(withTree(options)), {
      wrapper: AllTheProviders,
    });

  const options: Options = {
    accountId,
    account: sourceAccount,
    accounts: [sourceAccount, targetAccount],
    directTransactionCount: 0,
    isDeleted: false,
    enabled: true,
    entityLabel: 'Account',
    deleteAccount,
    recoverAction,
    mergeAccounts,
    disbandGroup,
  };

  it('offers disbanding for an empty parent account', () => {
    const child = { ...targetAccount, id: 'source-child' as AccountId, parentAccountId: accountId };
    const { result } = renderActionsHook({ ...options, accounts: [sourceAccount, child] });
    expect(result.current.actions.map(a => a.label)).toEqual(['Disband Group']);
  });

  it('omits management actions while disabled or deleted', () => {
    const { result, rerender } = renderHook(
      ({ enabled, isDeleted }: { enabled: boolean; isDeleted: boolean }) =>
        useAccountDeleteMergeActions(withTree({ ...options, enabled, isDeleted })),
      { initialProps: { enabled: false, isDeleted: false }, wrapper: AllTheProviders },
    );
    expect(result.current.actions).toEqual([]);
    rerender({ enabled: true, isDeleted: true });
    expect(result.current.actions).toEqual([]);
  });

  it('includes plain active accounts whose deleted timestamp is undefined', () => {
    const { result } = renderActionsHook({
      ...options,
      directTransactionCount: 3,
      accounts: [sourceAccount, { ...targetAccount, deletedAt: undefined }],
    });
    expect(result.current.mergePickerModal?.accounts.map(a => a.id)).toEqual([targetId]);
  });

  it('filters merge targets by parent role and excludes descendants', () => {
    const child = { ...targetAccount, id: 'source-child' as AccountId, parentAccountId: accountId };
    const childOfTarget = {
      ...sourceAccount,
      id: 'target-child' as AccountId,
      parentAccountId: targetId,
    };
    const { result } = renderActionsHook({
      ...options,
      directTransactionCount: 3,
      accounts: [sourceAccount, targetAccount, child, childOfTarget],
    });
    expect(result.current.mergePickerModal?.accounts.map(a => a.id)).toEqual([targetId]);
  });

  it('offers disbanding for a parent even when its children have entries', () => {
    const child = { ...targetAccount, parentAccountId: accountId };
    const { result } = renderActionsHook({
      ...options,
      accounts: [sourceAccount, child],
      directTransactionCount: 100,
    });
    expect(result.current.actions.map(action => action.label)).toEqual(['Disband Group']);
  });

  it('keeps group merging distinct and available without direct transactions', () => {
    const sourceChild = {
      ...targetAccount,
      id: 'source-child' as AccountId,
      parentAccountId: accountId,
    };
    const targetChild = {
      ...sourceAccount,
      id: 'target-child' as AccountId,
      parentAccountId: targetId,
    };
    const { result } = renderActionsHook({
      ...options,
      accounts: [sourceAccount, sourceChild, targetAccount, targetChild],
      directTransactionCount: 0,
    });
    expect(result.current.actions.map(a => a.label)).toEqual(['Disband Group', 'Merge Groups']);
    expect(result.current.mergePickerModal?.title).toBe('Merge Into Group');
    expect(result.current.mergePickerModal?.accounts.map(a => a.id)).toEqual([targetId]);
    act(() => result.current.actions[1].onPress());
    act(() => {
      void result.current.onConfirmMerge(targetId);
    });
    expect(confirm.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Merge Groups',
        requiredConfirmationValue: sourceAccount.name,
        message: expect.stringContaining('Each sub-account keeps its own transaction history'),
      }),
    );
  });

  it('requires the group name before disbanding and never calls ordinary delete', async () => {
    const child = { ...targetAccount, parentAccountId: accountId };
    const enclosing = { ...targetAccount, id: 'enclosing' as AccountId, name: 'Enclosing group' };
    const { result } = renderActionsHook({
      ...options,
      account: { ...sourceAccount, parentAccountId: enclosing.id },
      accounts: [{ ...sourceAccount, parentAccountId: enclosing.id }, child, enclosing],
    });
    act(() => result.current.actions[0].onPress());
    const confirmation = jest.mocked(confirm.show).mock.calls[0][0];
    expect(confirmation.requiredConfirmationValue).toBe(sourceAccount.name);
    expect(confirmation.message).toContain('into "Enclosing group"');
    expect(disbandGroup).not.toHaveBeenCalled();
    await act(async () => {
      await confirmation.onConfirm();
    });
    expect(disbandGroup).toHaveBeenCalledWith(accountId);
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(AppNavigation.afterAccountRemoval).toHaveBeenCalledWith(accountId, expect.any(Object));
  });

  it('excludes archived targets and prevents selecting a target outside the picker', async () => {
    const { result } = renderActionsHook({
      ...options,
      directTransactionCount: 3,
      accounts: [sourceAccount, { ...targetAccount, archivedAt: new Date() }],
    });
    expect(result.current.mergePickerModal?.accounts).toEqual([]);
    await act(async () => {
      await result.current.onConfirmMerge(targetId);
    });
    expect(confirm.show).not.toHaveBeenCalled();
    expect(mergeAccounts).not.toHaveBeenCalled();
  });

  it('lets a form release its dirty guard before departing after disbanding', async () => {
    const onRemoved = jest.fn<void, [() => void]>();
    const child = { ...targetAccount, parentAccountId: accountId };
    const { result } = renderActionsHook({
      ...options,
      accounts: [sourceAccount, child],
      onRemoved,
    });
    act(() => result.current.actions[0].onPress());
    await act(async () => {
      await jest.mocked(confirm.show).mock.calls[0][0].onConfirm();
    });
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(AppNavigation.afterAccountRemoval).not.toHaveBeenCalled();
    act(() => onRemoved.mock.calls[0][0]());
    expect(AppNavigation.afterAccountRemoval).toHaveBeenCalledWith(accountId, expect.any(Object));
  });

  it('defers departure after deleting or merging from a form just like disbanding', async () => {
    const onRemoved = jest.fn<void, [() => void]>();
    const { result } = renderActionsHook({ ...options, accounts: [sourceAccount], onRemoved });
    act(() => result.current.actions[0].onPress());
    await act(async () => {
      await jest.mocked(confirm.show).mock.calls[0][0].onConfirm();
    });
    expect(deleteAccount).toHaveBeenCalledWith(accountId);
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(AppNavigation.afterAccountRemoval).not.toHaveBeenCalled();

    const merging = renderActionsHook({ ...options, directTransactionCount: 2, onRemoved });
    await act(async () => {
      await merging.result.current.onConfirmMerge(targetId);
    });
    await act(async () => {
      await jest.mocked(confirm.show).mock.calls[1][0].onConfirm();
    });
    expect(mergeAccounts).toHaveBeenCalledWith(targetId, [accountId]);
    expect(onRemoved).toHaveBeenCalledTimes(2);
    expect(AppNavigation.afterAccountRemoval).not.toHaveBeenCalled();
  });

  it('stays on the current screen when disbanding fails', async () => {
    disbandGroup.mockRejectedValueOnce(new Error('Group is referenced by a budget'));
    const child = { ...targetAccount, parentAccountId: accountId };
    const onRemoved = jest.fn();
    const { result } = renderActionsHook({
      ...options,
      accounts: [sourceAccount, child],
      onRemoved,
    });
    act(() => result.current.actions[0].onPress());
    await act(async () => {
      await jest.mocked(confirm.show).mock.calls[0][0].onConfirm();
    });
    expect(onRemoved).not.toHaveBeenCalled();
    expect(AppNavigation.afterAccountRemoval).not.toHaveBeenCalled();
    expect(showErrorAlert).toHaveBeenCalledWith(
      expect.stringContaining('Group is referenced by a budget'),
    );
  });

  it('exposes delete when enabled with no transactions', () => {
    const { result } = renderActionsHook({
      accountId,
      account: sourceAccount,
      accounts: [sourceAccount, targetAccount],
      directTransactionCount: 0,
      isDeleted: false,
      enabled: true,
      entityLabel: 'Account',
      deleteAccount,
      recoverAction,
      mergeAccounts,
      disbandGroup,
    });

    expect(result.current.actions[0]).toMatchObject({
      icon: Icon.Delete,
      testID: 'delete-button',
    });
    expect(result.current.mergePickerModal).toBeNull();
  });

  it('exposes merge when enabled with transactions', () => {
    const { result } = renderActionsHook({
      accountId,
      account: sourceAccount,
      accounts: [sourceAccount, targetAccount],
      directTransactionCount: 3,
      isDeleted: false,
      enabled: true,
      entityLabel: 'Account',
      deleteAccount,
      recoverAction,
      mergeAccounts,
      disbandGroup,
    });

    expect(result.current.actions[0]).toMatchObject({
      icon: Icon.Merge,
      testID: 'merge-button',
    });
    expect(result.current.mergePickerModal).toMatchObject({
      visible: false,
      accounts: [targetAccount],
      title: 'Merge Into Account',
    });
  });

  it('shows a toast when merge has no eligible targets', () => {
    const { result } = renderActionsHook({
      accountId,
      account: sourceAccount,
      accounts: [sourceAccount],
      directTransactionCount: 2,
      isDeleted: false,
      enabled: true,
      entityLabel: 'Account',
      deleteAccount,
      recoverAction,
      mergeAccounts,
      disbandGroup,
    });

    act(() => result.current.actions[0]?.onPress());

    expect(toast.info).toHaveBeenCalledWith('No eligible accounts found to merge into.');
    expect(result.current.mergePickerModal?.visible).toBe(false);
  });

  it('opens the merge modal when candidates exist', () => {
    const { result } = renderActionsHook({
      accountId,
      account: sourceAccount,
      accounts: [sourceAccount, targetAccount],
      directTransactionCount: 2,
      isDeleted: false,
      enabled: true,
      entityLabel: 'Account',
      deleteAccount,
      recoverAction,
      mergeAccounts,
      disbandGroup,
    });

    act(() => result.current.actions[0]?.onPress());

    expect(result.current.mergePickerModal?.visible).toBe(true);
  });

  it('deletes the account and navigates away on confirm', async () => {
    const { result } = renderActionsHook({
      accountId,
      account: sourceAccount,
      accounts: [sourceAccount],
      directTransactionCount: 0,
      isDeleted: false,
      enabled: true,
      entityLabel: 'Account',
      deleteAccount,
      recoverAction,
      mergeAccounts,
      disbandGroup,
    });

    act(() => result.current.actions[0]?.onPress());

    const confirmCall = (confirm.show as jest.Mock).mock.calls[0][0];
    expect(confirmCall.requiredConfirmationValue).toBe(sourceAccount.name);
    expect(deleteAccount).not.toHaveBeenCalled();
    await act(async () => {
      await confirmCall.onConfirm();
    });

    expect(deleteAccount).toHaveBeenCalledWith(accountId);
    expect(toast.success).toHaveBeenCalledWith('Account has been deleted.', expect.any(Object));
    expect(AppNavigation.afterAccountRemoval).toHaveBeenCalledWith(accountId, expect.any(Object));
  });

  it('restores the account when undo is pressed after delete', async () => {
    const { result } = renderActionsHook({
      accountId,
      account: sourceAccount,
      accounts: [sourceAccount],
      directTransactionCount: 0,
      isDeleted: false,
      enabled: true,
      entityLabel: 'Account',
      deleteAccount,
      recoverAction,
      mergeAccounts,
      disbandGroup,
    });

    act(() => result.current.actions[0]?.onPress());

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
    const { result } = renderActionsHook({
      accountId,
      account: sourceAccount,
      accounts: [sourceAccount, targetAccount],
      directTransactionCount: 2,
      isDeleted: false,
      enabled: true,
      entityLabel: 'Account',
      deleteAccount,
      recoverAction,
      mergeAccounts,
      disbandGroup,
    });

    await act(async () => {
      await result.current.onConfirmMerge(targetId);
    });

    const confirmCall = (confirm.show as jest.Mock).mock.calls[0][0];
    await act(async () => {
      await confirmCall.onConfirm();
    });

    expect(mergeAccounts).toHaveBeenCalledWith(targetId, [accountId]);
    expect(toast.success).toHaveBeenCalledWith('Successfully merged into Target Account');
    expect(AppNavigation.afterAccountRemoval).toHaveBeenCalledWith(accountId, expect.any(Object));
  });

  it('reports merge failures', async () => {
    mergeAccounts.mockRejectedValueOnce(new Error('db locked'));

    const { result } = renderActionsHook({
      accountId,
      account: sourceAccount,
      accounts: [sourceAccount, targetAccount],
      directTransactionCount: 2,
      isDeleted: false,
      enabled: true,
      entityLabel: 'Account',
      deleteAccount,
      recoverAction,
      mergeAccounts,
      disbandGroup,
    });

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
