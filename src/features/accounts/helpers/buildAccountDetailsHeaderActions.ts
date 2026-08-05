import type { ScreenHeaderActionItem } from '@/src/components/common/ScreenHeaderActions';
import type { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import type { Theme } from '@/src/constants/design-tokens';

type AccountDetailsHeaderVm = Pick<
  AccountDetailsViewModel,
  'accountType' | 'headerActions' | 'unreconciledCount' | 'reconciledAt' | 'onAuditPress'
>;

export function buildAccountDetailsHeaderActions(
  vm: AccountDetailsHeaderVm,
  theme: Theme,
): ScreenHeaderActionItem[] {
  const isCategory = vm.accountType === 'INCOME' || vm.accountType === 'EXPENSE';
  const surface = 'surface' as const;

  if (vm.headerActions.canRecover) {
    return [
      {
        name: 'history',
        onPress: vm.onAuditPress,
        variant: surface,
        iconColor: theme.textSecondary,
      },
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
      name: 'history',
      onPress: vm.onAuditPress,
      variant: surface,
      iconColor: theme.textSecondary,
    },
    {
      name: 'edit',
      onPress: vm.headerActions.onEdit,
      variant: surface,
      iconColor: theme.text,
      testID: 'edit-button',
    },
    ...(!isCategory
      ? [
          {
            name: 'checkCircle' as const,
            onPress: vm.headerActions.onReconcile,
            variant: surface,
            iconColor:
              vm.unreconciledCount > 0
                ? theme.warning
                : vm.reconciledAt
                  ? theme.success
                  : theme.textSecondary,
            testID: 'reconcile-button',
          },
        ]
      : []),
    ...(vm.headerActions.canDelete
      ? [
          {
            name: 'delete' as const,
            onPress: vm.headerActions.onDelete,
            variant: surface,
            iconColor: theme.error,
            testID: 'delete-button',
          },
        ]
      : []),
    ...(vm.headerActions.canMerge
      ? [
          {
            name: 'merge' as const,
            onPress: vm.headerActions.onMerge,
            variant: surface,
            iconColor: theme.error,
            testID: 'merge-button',
          },
        ]
      : []),
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
