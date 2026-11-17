import { AppButton, AppIcon, AppText } from '@/src/components/core';
import type { IconName } from '@/src/types/domainIcons';
import { Icon } from '@/src/types/domainIcons';
import { Size } from '@/src/constants';
import { Stack, Inline } from '@/src/design-system';
import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  icon: IconName;
  children: ReactNode;
}

/** Detail pages can reveal deeper content with a labeled, accessible disclosure control. */
export function DetailDisclosure({ title, icon, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Stack gap={expanded ? 'md' : 'none'}>
      <Inline align="center" gap="xs">
        <AppButton
          variant="ghost"
          style={{ flex: 1 }}
          buttonStyle={{ paddingHorizontal: 0, alignItems: 'stretch' }}
          accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(value => !value)}
        >
          <Inline gap="md" align="center" flex={1}>
            <AppIcon name={icon} size={Size.iconMd} color="textSecondary" />
            <Stack gap="xs" flex={1}>
              <AppText variant="body" weight="semibold">
                {title}
              </AppText>
            </Stack>
            <AppIcon
              name={expanded ? Icon.ChevronUp : Icon.ChevronDown}
              size={Size.iconSm}
              color="textSecondary"
            />
          </Inline>
        </AppButton>
      </Inline>
      {expanded && children}
    </Stack>
  );
}
