import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import {
  ScreenHeaderActions,
  type ScreenHeaderActionItem,
} from '@/src/components/shared/ScreenHeaderActions';
import { Typography } from '@/src/constants';
import type { ComponentProps } from 'react';

type PrivacyToggleProps = ComponentProps<typeof PrivacyToggleButton>;

export type MoneyDetailHeaderActionsProps = {
  actions: ScreenHeaderActionItem[];
  privacyVariant?: PrivacyToggleProps['variant'];
};

/**
 * Route actions + privacy eye.
 * Privacy is always trailing (rightmost) — same slot as privacy-only screens.
 */
export function MoneyDetailHeaderActions({
  actions,
  privacyVariant = 'clear',
}: MoneyDetailHeaderActionsProps) {
  return (
    <ScreenHeaderActions
      actions={actions}
      trailing={<PrivacyToggleButton variant={privacyVariant} size={Typography.sizes.xl} />}
    />
  );
}
