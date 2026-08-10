import type { ScreenHeaderActionItem } from '@/src/components/common/ScreenHeaderActions';
import type { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import type { Theme } from '@/src/constants/design-tokens';

type AccountDetailsHeaderVm = Pick<AccountDetailsViewModel, 'headerActions'>;

export function buildAccountDetailsHeaderActions(
  vm: AccountDetailsHeaderVm,
  theme: Theme,
): ScreenHeaderActionItem[] {
  const surface = 'surface' as const;

  if (vm.headerActions.canRecover) {
    return [
      {
        name: 'refresh',
        onPress: vm.headerActions.onRecover,
        variant: surface,
        iconColor: theme.income,
      },
    ];
  }

  return [
    {
      name: 'edit',
      onPress: vm.headerActions.onEdit,
      variant: surface,
      iconColor: theme.text,
      testID: 'edit-button',
    },
  ];
}

export function accountDetailsScreenTitle(
  vm: Pick<AccountDetailsViewModel, 'isParent' | 'accountType'>,
): string {
  const isCategory = vm.accountType === 'INCOME' || vm.accountType === 'EXPENSE';
  if (vm.isParent) {
    return isCategory ? 'Group Category' : 'Group Account';
  }
  return isCategory ? 'Category Details' : 'Account Details';
}
