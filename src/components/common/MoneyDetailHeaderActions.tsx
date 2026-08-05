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

/**
 * Route actions + privacy eye.
 * Privacy is always trailing (rightmost) — same slot as privacy-only screens.
 */
export function MoneyDetailHeaderActions({
  actions,
  privacyVariant = 'clear',
  privacySize = Typography.sizes.xl,
}: MoneyDetailHeaderActionsProps) {
  return (
    <ScreenHeaderActions
      actions={actions}
      trailing={<PrivacyToggleButton variant={privacyVariant} size={privacySize} />}
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
