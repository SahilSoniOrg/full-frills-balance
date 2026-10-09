import {
  toHeaderIconButtons,
  toMenuActions,
  type AccountManagementAction,
} from '@/src/features/accounts/helpers/accountManagementActions';
import { buildAccountDetailsHeaderActions } from '@/src/features/accounts/helpers/buildAccountDetailsHeaderActions';
import { Icon } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';
import type { Theme } from '@/src/constants/design-tokens';

const theme = {
  error: 'red',
  primary: 'blue',
  textSecondary: 'grey',
  income: 'green',
  text: 'black',
} as Theme;

const archive: AccountManagementAction = {
  label: 'Unarchive account',
  icon: Icon.Archive,
  onPress: jest.fn(),
  tone: 'active',
  disabled: true,
  testID: 'archive-account-button',
};
const remove: AccountManagementAction = {
  label: 'Delete Account',
  icon: Icon.Delete,
  onPress: jest.fn(),
  tone: 'destructive',
  testID: 'delete-button',
};

describe('account management actions', () => {
  it('tints form header buttons by tone, keeping an archived account highlighted', () => {
    expect(toHeaderIconButtons([archive, remove], theme)).toEqual([
      expect.objectContaining({
        name: Icon.Archive,
        iconColor: 'blue',
        disabled: true,
        accessibilityLabel: 'Unarchive account',
      }),
      expect.objectContaining({ name: Icon.Delete, iconColor: 'red', testID: 'delete-button' }),
    ]);
  });

  it('marks only destructive actions as destructive menu rows', () => {
    expect(toMenuActions([archive, remove]).map(action => action.destructive)).toEqual([
      false,
      true,
    ]);
  });

  it('offers only recovery for a deleted account', () => {
    const header = buildAccountDetailsHeaderActions(
      {
        accountType: AccountType.ASSET,
        isDeleted: true,
        onRecover: jest.fn(),
        onSearch: jest.fn(),
        onEdit: jest.fn(),
        managementActions: [remove],
      },
      theme,
    );
    expect(header.leading.map(action => action.testID)).toEqual(['recover-button']);
    expect(header.menu).toEqual([]);
  });

  it('puts search up front and edit before management actions in the menu', () => {
    const header = buildAccountDetailsHeaderActions(
      {
        accountType: AccountType.EXPENSE,
        isDeleted: false,
        onRecover: jest.fn(),
        onSearch: jest.fn(),
        onEdit: jest.fn(),
        managementActions: [archive, remove],
      },
      theme,
    );
    expect(header.leading.map(action => action.testID)).toEqual(['search-button']);
    expect(header.menu.map(action => action.label)).toEqual([
      'Edit Category',
      'Unarchive account',
      'Delete Account',
    ]);
  });
});
