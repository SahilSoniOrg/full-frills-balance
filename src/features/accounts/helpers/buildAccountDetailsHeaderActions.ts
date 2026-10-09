import type { Theme } from '@/src/constants/design-tokens';
import { accountDetailsCopy } from '@/src/features/accounts/helpers/accountFlowLabels';
import {
  toMenuActions,
  type AccountManagementAction,
} from '@/src/features/accounts/helpers/accountManagementActions';
import type { AccountDetailsHeaderActions } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { Icon } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';

/** A deleted account offers only recovery; a live one gets search up front and the rest in a menu. */
export function buildAccountDetailsHeaderActions(
  input: {
    accountType: AccountType;
    isDeleted: boolean;
    onRecover: () => void;
    onSearch: () => void;
    onEdit: () => void;
    managementActions: AccountManagementAction[];
  },
  theme: Theme,
): AccountDetailsHeaderActions {
  if (input.isDeleted) {
    return {
      leading: [
        {
          name: Icon.Refresh,
          onPress: input.onRecover,
          variant: 'surface',
          iconColor: theme.income,
          testID: 'recover-button',
          accessibilityLabel: 'Recover account',
        },
      ],
      menu: [],
    };
  }

  return {
    leading: [
      {
        name: Icon.Search,
        onPress: input.onSearch,
        variant: 'surface',
        iconColor: theme.text,
        testID: 'search-button',
        accessibilityLabel: 'Search transactions',
      },
    ],
    menu: [
      {
        label: `Edit ${accountDetailsCopy(input.accountType).entity}`,
        icon: Icon.Edit,
        onPress: input.onEdit,
        testID: 'edit-button',
      },
      ...toMenuActions(input.managementActions),
    ],
  };
}
