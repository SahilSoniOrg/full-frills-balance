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
  privacyPosition?: 'leading' | 'trailing';
};

/**
 * Route actions + privacy eye.
 * Privacy defaults to trailing (rightmost) — same slot as privacy-only screens.
 */
export function MoneyDetailHeaderActions({
  actions,
  privacyVariant = 'clear',
  privacyPosition = 'trailing',
}: MoneyDetailHeaderActionsProps) {
  const privacy = <PrivacyToggleButton variant={privacyVariant} size={Typography.sizes.xl} />;
  return (
    <ScreenHeaderActions
      actions={actions}
      leading={privacyPosition === 'leading' ? privacy : undefined}
      trailing={privacyPosition === 'trailing' ? privacy : undefined}
    />
  );
}
