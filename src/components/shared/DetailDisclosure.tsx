import { AppButton, AppIcon, AppSurface, AppText } from '@/src/components/core';
import type { IconName } from '@/src/types/domainIcons';
import { Icon } from '@/src/types/domainIcons';
import { Size } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  icon: IconName;
  summary?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  variant?: 'card' | 'plain';
}

/** Detail pages expose a short summary first, with labeled, accessible disclosure controls. */
export function DetailDisclosure({
  title,
  icon,
  summary,
  children,
  defaultExpanded = false,
  variant = 'card',
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const content = (
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
              {summary != null &&
                (typeof summary === 'string' ? (
                  <AppText variant="caption" color="secondary" numberOfLines={2}>
                    {summary}
                  </AppText>
                ) : (
                  summary
                ))}
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
  return variant === 'plain' ? (
    content
  ) : (
    <AppSurface elevation="sm" padding="md" radius="r2">
      {content}
    </AppSurface>
  );
}
