import React from 'react';
import { TouchableOpacity } from 'react-native';
import { AppIcon } from '@/src/components/core';
import { AppConfig, Size } from '@/src/constants';
import { Inline, Stack, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';

interface SafeToSpendHeaderProps {
  isOverCommitted: boolean;
  isPositiveSafeToSpend: boolean;
  displayValue: string | React.ReactNode;
  onInfoPress: () => void;
  isLoading?: boolean;
}

export const SafeToSpendHeader = ({
  isOverCommitted,
  isPositiveSafeToSpend,
  displayValue,
  onInfoPress,
}: SafeToSpendHeaderProps) => {
  const { theme } = useTheme();
  const strings = AppConfig.strings.dashboard;

  return (
    <Stack gap="sm">
      <Inline gap="xs" alignItems="center" justifyContent="space-between">
        <Text
          variant="xs"
          weight="bold"
          color={isOverCommitted ? 'error' : 'secondary'}
          style={{ letterSpacing: 1.5, textTransform: 'uppercase' }}
        >
          {isOverCommitted ? strings.shortfall : strings.safeToSpendTitle}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open safe-to-spend calculation info"
          onPress={onInfoPress}
        >
          <AppIcon
            name="helpCircle"
            fallbackIcon="helpCircle"
            size={Size.xs}
            color={isOverCommitted ? theme.error : theme.textSecondary}
          />
        </TouchableOpacity>
      </Inline>

      <Text
        variant="hero"
        color={isOverCommitted ? 'error' : isPositiveSafeToSpend ? 'success' : undefined}
        weight="bold"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        ellipsizeMode="tail"
        style={{ width: '100%' }}
      >
        {displayValue}
      </Text>
      <Text variant="xs" color={isOverCommitted ? 'error' : 'secondary'}>
        {isOverCommitted ? strings.neededForObligations : strings.afterObligations}
      </Text>
    </Stack>
  );
};
