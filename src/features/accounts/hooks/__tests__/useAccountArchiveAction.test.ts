import { act, renderHook, AllTheProviders } from '@/src/utils/test-utils';
import { useAccountArchiveAction } from '../useAccountArchiveAction';
import { confirm, toast } from '@/src/utils/alerts';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { PlainAccount } from '@/src/types/plainDtos';

jest.mock('../useAccountActions', () => ({
  useAccountActions: () => ({ applyArchiveChanges: mockApplyArchiveChanges }),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace' }),
}));
jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
  toast: { success: jest.fn() },
  showErrorAlert: jest.fn(),
}));

const parent: PlainAccount = {
  id: asAccountId('parent'),
  name: 'Group',
  accountType: AccountType.ASSET,
  currencyCode: 'INR',
};
const child: PlainAccount = { ...parent, id: asAccountId('child'), parentAccountId: parent.id };
const mockApplyArchiveChanges = jest.fn<Promise<boolean>, [unknown]>();
const lastConfirmation = () => {
  const options = jest.mocked(confirm.show).mock.calls.at(-1)?.[0];
  if (!options) throw new Error('Expected an archive confirmation');
  return options;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApplyArchiveChanges.mockResolvedValue(true);
});

it('requires confirmation and descendant selection before archiving a parent', async () => {
  const { result } = renderHook(
    () =>
      useAccountArchiveAction({
        enabled: true,
        accountId: parent.id,
        account: parent,
        accounts: [parent, child],
      }),
    { wrapper: AllTheProviders },
  );
  act(() => result.current.actions[0].onPress());
  expect(confirm.show).toHaveBeenCalled();
  expect(mockApplyArchiveChanges).not.toHaveBeenCalled();
  expect(result.current.archiveCascadeModal).toBeNull();
  await act(async () => {
    await lastConfirmation().onConfirm?.();
  });
  expect(result.current.archiveCascadeModal?.rootAccountId).toBe(parent.id);
  expect(mockApplyArchiveChanges).not.toHaveBeenCalled();
  await act(async () => {
    result.current.archiveCascadeModal?.onConfirm([parent.id, child.id]);
  });
  expect(mockApplyArchiveChanges).toHaveBeenCalledWith({
    toArchive: [parent.id, child.id],
    toUnarchive: [],
  });
});

it('does not report success when the archive command makes no change', async () => {
  mockApplyArchiveChanges.mockResolvedValue(false);
  const { result } = renderHook(
    () =>
      useAccountArchiveAction({
        enabled: true,
        accountId: child.id,
        account: child,
        accounts: [parent, child],
      }),
    { wrapper: AllTheProviders },
  );
  act(() => result.current.actions[0].onPress());
  await act(async () => {
    await lastConfirmation().onConfirm?.();
  });
  expect(mockApplyArchiveChanges).toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});

it('preserves the special warning for system accounts', () => {
  const system = { ...parent, name: AppConfig.systemAccounts.openingBalances.namePrefix };
  const { result } = renderHook(
    () =>
      useAccountArchiveAction({
        enabled: true,
        accountId: system.id,
        account: system,
        accounts: [system],
      }),
    { wrapper: AllTheProviders },
  );
  act(() => result.current.actions[0].onPress());
  expect(lastConfirmation().title).toBe(AppConfig.strings.accounts.archive.systemAccountTitle);
  expect(mockApplyArchiveChanges).not.toHaveBeenCalled();
});

it('offers the archived-parent choice when restoring a child', async () => {
  const archivedParent = { ...parent, archivedAt: 123 };
  const archivedChild = { ...child, archivedAt: 123 };
  const { result } = renderHook(
    () =>
      useAccountArchiveAction({
        enabled: true,
        accountId: child.id,
        account: archivedChild,
        accounts: [archivedParent, archivedChild],
      }),
    { wrapper: AllTheProviders },
  );
  act(() => result.current.actions[0].onPress());
  expect(lastConfirmation().title).toBe(AppConfig.strings.accounts.archive.parentArchivedTitle);
  await act(async () => {
    await lastConfirmation().onConfirm?.();
  });
  expect(result.current.archiveCascadeModal?.rootAccountId).toBe(parent.id);
  expect(mockApplyArchiveChanges).not.toHaveBeenCalled();
});
