import type { ScreenHeaderActionItem } from '@/src/components/shared/ScreenHeaderActions';
import type { AccountDetailsViewModel } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import type { Theme } from '@/src/constants/design-tokens';
import { isCategoryAccountType } from '@/src/utils/accountCategory';
import { AccountType } from '@/src/types/enums';
import { Icon } from '@/src/types/domainIcons';

type AccountDetailsHeaderActions = AccountDetailsViewModel['headerActions'];

export function buildAccountDetailsHeaderActions(
  headerActions: AccountDetailsHeaderActions,
  theme: Theme,
): ScreenHeaderActionItem[] {
  const surface = 'surface' as const;

  if (headerActions.canRecover) {
    return [
      {
        name: Icon.Refresh,
        onPress: headerActions.onRecover,
        variant: surface,
        iconColor: theme.income,
      },
    ];
  }

  const actions: ScreenHeaderActionItem[] = [];

  if (headerActions.onSearch) {
    actions.push({
      name: Icon.Search,
      onPress: headerActions.onSearch,
      variant: surface,
      iconColor: theme.text,
      testID: 'search-button',
      accessibilityLabel: 'Search transactions',
    });
  }

  actions.push({
    name: Icon.Edit,
    onPress: headerActions.onEdit,
    variant: surface,
    iconColor: theme.text,
    testID: 'edit-button',
  });

  return actions;
}

export function accountDetailsScreenTitle(vm: {
  isParent: boolean;
  accountType: string | AccountType;
}): string {
  const isCategory = isCategoryAccountType(vm.accountType as AccountType);
  if (vm.isParent) {
    return isCategory ? 'Group Category' : 'Group Account';
  }
  return isCategory ? 'Category Details' : 'Account Details';
}
