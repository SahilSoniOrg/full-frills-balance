import { AppButton, AppIcon, AppText } from '@/src/components/core';
import type { IconName } from '@/src/types/domainIcons';
import { Icon } from '@/src/types/domainIcons';
import { Size } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
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
    <Column gap={expanded ? 'md' : 'none'}>
      <Row align="center" gap="xs">
        <AppButton
          variant="ghost"
          style={{ flex: 1 }}
          buttonStyle={{ paddingHorizontal: 0, alignItems: 'stretch' }}
          accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(value => !value)}
        >
          <Row gap="md" align="center" flex={1}>
            <AppIcon name={icon} size={Size.iconMd} color="textSecondary" />
            <Column gap="xs" flex={1}>
              <AppText variant="body" weight="semibold">
                {title}
              </AppText>
            </Column>
            <AppIcon
              name={expanded ? Icon.ChevronUp : Icon.ChevronDown}
              size={Size.iconSm}
              color="textSecondary"
            />
          </Row>
        </AppButton>
      </Row>
      {expanded && children}
    </Column>
  );
}
