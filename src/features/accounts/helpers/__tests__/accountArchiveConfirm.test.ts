import Account from '@/src/data/models/Account';
import {
  resolveArchiveConfirmOptions,
  runArchiveIntentWithConfirmation,
  showArchiveIntentConfirmation,
} from '@/src/features/accounts/helpers/accountArchiveConfirm';
import { AccountId } from '@/src/types/domain';
import { confirm } from '@/src/utils/alerts';

jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
}));

jest.mock('@/src/services/accounts/accountSystemAccounts', () => ({
  isSystemAccount: jest.fn((account: { name: string }) => account.name === 'System Account'),
}));

describe('accountArchiveConfirm', () => {
  const accountId = 'child' as AccountId;
  const parentId = 'parent' as AccountId;

  const baseAccount = {
    id: accountId,
    name: 'Checking',
    parentAccountId: null,
  } as unknown as Account;

  const proceed = jest.fn();
  const openCascade = jest.fn();
  const commitArchive = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildIntent(
    overrides: Partial<Parameters<typeof resolveArchiveConfirmOptions>[0]> = {},
  ) {
    return {
      archiving: true,
      account: baseAccount,
      accountId,
      accounts: [baseAccount],
      hasDescendants: false,
      proceed,
      openCascade,
      commitArchive,
      ...overrides,
    };
  }

  it('shows system-account confirm when archiving a system account', () => {
    const systemAccount = { ...baseAccount, name: 'System Account' } as Account;
    const options = resolveArchiveConfirmOptions(
      buildIntent({ account: systemAccount, archiving: true }),
    );

    expect(options).toMatchObject({
      title: 'Archive system account?',
      confirmText: 'Archive anyway',
    });
  });

  it('shows parent-archived confirm when unarchiving a child of an archived parent', () => {
    const parent = {
      id: parentId,
      name: 'Parent',
      archivedAt: Date.now(),
      parentAccountId: null,
    } as unknown as Account;
    const child = {
      ...baseAccount,
      parentAccountId: parentId,
    } as Account;

    const options = resolveArchiveConfirmOptions(
      buildIntent({
        archiving: false,
        account: child,
        accounts: [child, parent],
      }),
    );

    expect(options).toMatchObject({
      title: 'Parent is archived',
      confirmText: 'Unarchive parent',
      cancelText: 'This account only',
    });

    if (options && options !== 'default') {
      options.onConfirm?.();
      expect(openCascade).toHaveBeenCalledWith(false, parentId);

      options.onCancel?.();
      expect(commitArchive).toHaveBeenCalledWith([accountId], false);
    }
  });

  it('falls back to default archive confirm for a normal archive', () => {
    expect(resolveArchiveConfirmOptions(buildIntent())).toBe('default');
  });

  it('runs the default archive confirm through confirm.show', () => {
    runArchiveIntentWithConfirmation(buildIntent({ archiving: true }));

    expect(confirm.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Archive account',
        destructive: true,
        onConfirm: proceed,
      }),
    );
  });

  it('runs the default unarchive confirm through confirm.show', () => {
    runArchiveIntentWithConfirmation(buildIntent({ archiving: false }));

    expect(confirm.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unarchive account',
        destructive: false,
        onConfirm: proceed,
      }),
    );
  });

  it('showArchiveIntentConfirmation uses archive copy when archiving', () => {
    showArchiveIntentConfirmation(true, proceed);

    expect(confirm.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Archive account',
        message: expect.stringContaining('Hide this account'),
      }),
    );
  });
});
