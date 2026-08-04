import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppIcon, AppSurface, Badge, IconName } from '@/src/components/core';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { Box, Column, Row, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import { TouchableOpacity } from 'react-native';

export interface PlannedPaymentHistoryCardProps {
  journalId: string;
  journalTitle: string;
  journalAmount: number;
  currencyCode: string;
  journalDate: number | Date;

  // The reference planned payment info to compare against
  plannedAmount: number;
  plannedTitle: string;

  presentation: {
    label: string; // e.g. "Scheduled" or "Posted"
    typeIcon: IconName; // e.g. 'arrowUp', 'arrowDown'
    typeColor: string; // e.g. 'income', 'expense', 'textSecondary'
  };

  isOverdue?: boolean;

  onPress?: () => void;
}

/**
 * Custom Card designed specifically for Planned Payment History.
 * Emphasizes the Date (acting as title) and highlights if the generated journal
 * deviated from the base rule (e.g. amount changed).
 */
export const PlannedPaymentHistoryCard = ({
  journalTitle,
  journalAmount,
  currencyCode,
  journalDate,
  plannedAmount,
  plannedTitle,
  presentation,
  isOverdue,
  onPress,
}: PlannedPaymentHistoryCardProps) => {
  const { theme, themeMode } = useTheme();
  const formatMoney = useMoneyFormat();
  const formattedDate = formatDate(journalDate, { includeTime: true });

  // Check for deviations from the base rule configuration
  const isAmountDeviated = Math.abs(journalAmount - plannedAmount) > 0.01; // float safety
  const isTitleDeviated = journalTitle !== plannedTitle;

  const content = (
    <Column padding="lg">
      <Row justify="space-between" align="center" marginBottom="md">
        <Column flex={1} marginRight="sm">
          <Text variant="subheading" weight="bold" numberOfLines={1}>
            {formattedDate}
          </Text>
        </Column>

        <Badge
          variant="default"
          size="sm"
          backgroundColor={withOpacity(
            theme[presentation.typeColor as keyof typeof theme] as string,
            themeMode === 'dark' ? Opacity.muted : Opacity.soft,
          )}
          textColor={theme[presentation.typeColor as keyof typeof theme] as string}
          icon={presentation.typeIcon}
          style={{ borderRightWidth: 0 }}
        >
          {presentation.label}
        </Badge>
      </Row>

      <Box unsafe_backgroundRaw={withOpacity('#000', Opacity.ghost)} padding="md" borderRadius="md">
        <Row gap="md">
          <Column flex={1}>
            <Text variant="xs" color="secondary" marginBottom="xs">
              AMOUNT
            </Text>
            <Row align="center" gap="xs">
              <Text
                variant="base"
                weight="bold"
                style={{ color: theme[presentation.typeColor as keyof typeof theme] as string }}
              >
                {formatMoney(journalAmount, currencyCode)}
              </Text>
              {isAmountDeviated && (
                <Box
                  unsafe_backgroundRaw={withOpacity(theme.warning, Opacity.soft)}
                  padding={2}
                  borderRadius="full"
                >
                  <AppIcon name="error" size={12} color={theme.warning} />
                </Box>
              )}
            </Row>
            {isAmountDeviated && (
              <Text
                variant="xs"
                color="warning"
                opacity={0.8}
                marginTop={2}
                style={{ fontSize: 10 }}
              >
                Originally {formatMoney(plannedAmount, currencyCode)}
              </Text>
            )}
          </Column>

          <Column flex={1}>
            <Text variant="xs" color="secondary" marginBottom="xs">
              TITLE
            </Text>
            <Row align="center" style={{ flexShrink: 1 }}>
              <Text variant="base" numberOfLines={1} style={{ flexShrink: 1 }}>
                {journalTitle || 'No Title'}
              </Text>
              {isTitleDeviated && (
                <Box
                  unsafe_backgroundRaw={withOpacity(theme.primary, Opacity.soft)}
                  marginLeft="xs"
                  padding={2}
                  borderRadius="full"
                >
                  <AppIcon name="edit" size={12} color={theme.primary} />
                </Box>
              )}
            </Row>
          </Column>
        </Row>
      </Box>
    </Column>
  );

  return (
    <AppSurface
      elevation="sm"
      padding="none"
      radius="r3"
      background="surface"
      borderWidth={isOverdue ? 1 : undefined}
      borderColor={isOverdue ? 'error' : undefined}
      style={{
        marginBottom: Spacing.md,
        overflow: 'hidden',
      }}
    >
      {onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={Opacity.heavy}>
          {content}
        </TouchableOpacity>
      ) : (
        content
      )}
    </AppSurface>
  );
};
