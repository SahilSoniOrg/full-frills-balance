import { AppIcon } from '@/src/components/core';
import { AppConfig, Size } from '@/src/constants';
import { Column, Row, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { TouchableOpacity } from 'react-native';

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
    <Column gap="xs">
      <Row align="center" justify="space-between">
        <Text
          variant="xs"
          weight="bold"
          color={isOverCommitted ? 'error' : 'secondary'}
          style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}
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
      </Row>

      <Text
        variant="hero"
        color={isOverCommitted ? 'error' : isPositiveSafeToSpend ? 'success' : undefined}
        weight="bold"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        ellipsizeMode="tail"
      >
        {displayValue}
      </Text>

      <Text variant="xs" color={isOverCommitted ? 'error' : 'secondary'} opacity={0.8}>
        {isOverCommitted ? strings.neededForObligations : strings.afterObligations}
      </Text>
    </Column>
  );
};
