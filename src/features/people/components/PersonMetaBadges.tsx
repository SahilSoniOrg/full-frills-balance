import { AppIcon, Badge } from '@/src/components/core';
import { Size } from '@/src/constants/design-tokens';
import { Inline } from '@/src/design-system';
import { Icon } from '@/src/types/domainIcons';
import type { ReactNode } from 'react';

type PersonMetaBadgesProps = {
  isPinned?: boolean;
  currency?: string | null;
  archived?: boolean;
  /** List rows use a star icon; detail headers use a labeled badge. */
  pinnedPresentation?: 'icon' | 'badge';
  /** Rendered before the meta chips (e.g. person name on list cards). */
  leading?: ReactNode;
  extras?: ReactNode;
};

export function PersonMetaBadges({
  isPinned = false,
  currency,
  archived = false,
  pinnedPresentation = 'badge',
  leading,
  extras,
}: PersonMetaBadgesProps) {
  return (
    <Inline gap="sm" alignItems="center" flexWrap="wrap">
      {leading}
      {isPinned ? (
        pinnedPresentation === 'icon' ? (
          <AppIcon name={Icon.Star} size={Size.iconXs} color="primary" />
        ) : (
          <Badge size="sm" variant="primary" icon={Icon.Star}>
            Pinned
          </Badge>
        )
      ) : null}
      {currency ? <Badge size="sm">{currency}</Badge> : null}
      {archived ? <Badge size="sm">Archived</Badge> : null}
      {extras}
    </Inline>
  );
}
