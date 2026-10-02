import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { Icon, AppIcon, AppSurface, Badge, IconName, AppText } from '@/src/components/core';
import { Opacity } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import { TouchableOpacity } from 'react-native';
import { ComponentVariant, getVariantMainColor } from '@/src/utils/style-helpers';

export interface PlannedPaymentHistoryCardProps {
  journalId: string;
  journalTitle: string;
  journalAmount: number;
  currencyCode: string;
  journalDate: number | Date;
  plannedAmount: number;
  plannedCurrencyCode?: string;
  plannedTitle: string;
  presentation: { label: string; typeIcon: IconName; typeColor: ComponentVariant };
  isOverdue?: boolean;
  isSelected?: boolean;
  isSelectionModeActive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

/** Show the occurrence first; keep differences from the rule readable without repeating it. */
export function PlannedPaymentHistoryCard({
  journalTitle,
  journalAmount,
  currencyCode,
  journalDate,
  plannedAmount,
  plannedCurrencyCode = currencyCode,
  plannedTitle,
  presentation,
  isOverdue,
  isSelected,
  isSelectionModeActive,
  onPress,
  onLongPress,
}: PlannedPaymentHistoryCardProps) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const amountChanged =
    currencyCode !== plannedCurrencyCode || Math.abs(journalAmount - plannedAmount) > 0.01;
  const titleChanged = journalTitle !== plannedTitle;
  const date = formatDate(journalDate);
  const amount = formatMoney(journalAmount, currencyCode);
  const content = (
    <Column padding="md" gap="sm">
      <Row align="center" justify="space-between" gap="sm" flexWrap="wrap">
        <Row align="center" gap="xs" flexShrink={1}>
          {isSelectionModeActive && (
            <AppIcon
              name={isSelected ? Icon.CheckSquare : Icon.Square}
              size={18}
              color={isSelected ? theme.primary : theme.textTertiary}
            />
          )}
          <AppText variant="body" weight="semibold">
            {date}
          </AppText>
        </Row>
        <Badge variant={isOverdue ? 'error' : 'default'} size="sm">
          {presentation.label}
        </Badge>
      </Row>
      <Row align="center" gap="xs">
        <AppIcon
          name={presentation.typeIcon}
          size={18}
          color={getVariantMainColor(theme, presentation.typeColor)}
        />
        <AppText
          variant="subheading"
          weight="bold"
          style={{ flexShrink: 1 }}
          color={presentation.typeColor}
        >
          {amount}
        </AppText>
      </Row>
      {amountChanged && (
        <AppText variant="caption" color="secondary">
          Scheduled amount: {formatMoney(plannedAmount, plannedCurrencyCode)}
        </AppText>
      )}
      {titleChanged && (
        <AppText variant="body" color="secondary">
          {journalTitle}
        </AppText>
      )}
    </Column>
  );
  return (
    <AppSurface
      elevation="sm"
      padding="none"
      radius="r2"
      borderWidth={isSelected ? 2 : isOverdue ? 1 : undefined}
      borderColor={isSelected ? 'primary' : isOverdue ? 'error' : undefined}
      overflow="hidden"
    >
      {onPress || onLongPress ? (
        <TouchableOpacity
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={200}
          activeOpacity={Opacity.heavy}
          accessibilityRole="button"
          accessibilityLabel={`${date}, ${presentation.label}, ${amount}${titleChanged ? `, ${journalTitle}` : ''}`}
          accessibilityState={isSelectionModeActive ? { selected: !!isSelected } : undefined}
        >
          {content}
        </TouchableOpacity>
      ) : (
        content
      )}
    </AppSurface>
  );
}
