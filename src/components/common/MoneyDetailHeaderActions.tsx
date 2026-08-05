import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import {
  ScreenHeaderActions,
  type ScreenHeaderActionItem,
} from '@/src/components/common/ScreenHeaderActions';
import type { Theme } from '@/src/constants/design-tokens';
import { Typography } from '@/src/constants';
import type { ComponentProps } from 'react';

type PrivacyToggleProps = ComponentProps<typeof PrivacyToggleButton>;

export type MoneyDetailHeaderActionsProps = {
  actions: ScreenHeaderActionItem[];
  privacyVariant?: PrivacyToggleProps['variant'];
  privacySize?: PrivacyToggleProps['size'];
};

/** Privacy eye + route actions for money detail screens. */
export function MoneyDetailHeaderActions({
  actions,
  privacyVariant = 'clear',
  privacySize = Typography.sizes.xl,
}: MoneyDetailHeaderActionsProps) {
  return (
    <ScreenHeaderActions
      leading={<PrivacyToggleButton variant={privacyVariant} size={privacySize} />}
      actions={actions}
    />
  );
}

export function moneyDetailEditDeleteActions(
  onEdit: () => void,
  onDelete: () => void,
  theme: Theme,
): ScreenHeaderActionItem[] {
  return [
    {
      name: 'edit',
      onPress: onEdit,
      iconColor: theme.text,
      size: Typography.sizes.xl,
      testID: 'edit-button',
    },
    {
      name: 'delete',
      onPress: onDelete,
      iconColor: theme.error,
      size: Typography.sizes.xl,
      testID: 'delete-button',
    },
  ];
}
