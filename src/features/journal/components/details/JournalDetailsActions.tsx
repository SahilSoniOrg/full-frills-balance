import { AppButton, AppIcon, AppText, type IconName } from '@/src/components/core';
import { Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo } from 'react';

interface JournalDetailsActionsProps {
  onPost?: () => void;
  onSkip?: () => void;
  onRevertToScheduled?: () => void;
  revertButtonLabel?: string;
}

interface DeclarativeAction {
  key: string;
  variant: 'primary' | 'outline' | 'ghost';
  label: string;
  icon?: IconName;
  onPress: () => void;
  textColor?: string;
  iconColor?: string;
}

export const JournalDetailsActions = React.memo(
  ({ onPost, onSkip, onRevertToScheduled, revertButtonLabel }: JournalDetailsActionsProps) => {
    const { theme } = useTheme();

    const actions = useMemo(() => {
      const list: DeclarativeAction[] = [];

      if (onPost) {
        list.push({
          key: 'post',
          variant: 'primary',
          label: 'Post Transaction Now',
          icon: 'check',
          onPress: onPost,
          textColor: theme.onPrimary,
          iconColor: theme.onPrimary,
        });
      }

      if (onPost && onSkip) {
        list.push({
          key: 'skip',
          variant: 'outline',
          label: 'Skip This Occurrence',
          icon: 'close',
          onPress: onSkip,
          textColor: theme.text,
          iconColor: theme.text,
        });
      }

      if (onRevertToScheduled) {
        list.push({
          key: 'revert',
          variant: 'outline',
          label: revertButtonLabel || 'Revert to Scheduled',
          icon: 'history',
          onPress: onRevertToScheduled,
          textColor: theme.primary,
          iconColor: theme.primary,
        });
      }

      return list;
    }, [onPost, onSkip, onRevertToScheduled, revertButtonLabel, theme]);

    if (actions.length === 0) return null;

    return (
      <Stack space="sm" padding="none">
        {actions.map(action => (
          <AppButton
            key={action.key}
            variant={action.variant}
            onPress={action.onPress}
            style={{ width: '100%' }}
          >
            <Inline space="sm" alignItems="center">
              {action.icon && <AppIcon name={action.icon} size={18} color={action.iconColor} />}
              <AppText variant="body" weight="bold" style={{ color: action.textColor }}>
                {action.label}
              </AppText>
            </Inline>
          </AppButton>
        ))}
      </Stack>
    );
  },
);

JournalDetailsActions.displayName = 'JournalDetailsActions';
