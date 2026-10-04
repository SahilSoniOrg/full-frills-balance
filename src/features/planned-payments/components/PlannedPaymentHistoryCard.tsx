import { TouchableOpacity, View } from 'react-native';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppIcon, AppText, Icon, type IconName } from '@/src/components/core';
import { AppConfig, Opacity } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import { getVariantColors, type ComponentVariant } from '@/src/utils/style-helpers';
const copy = AppConfig.strings.plannedDetailRedesign;

export interface PlannedPaymentHistoryCardProps {
  testID: string;
  journalAmount: number;
  currencyCode: string;
  journalDate: number | Date;
  journalTitle: string;
  plannedTitle: string;
  plannedAmount: number;
  plannedCurrencyCode: string;
  presentation: {
    label: string;
    subtitle: string;
    color: ComponentVariant;
    dotIcon: IconName;
    isSkipped: boolean;
    differenceAmount?: number;
    differenceCurrencyCode?: string;
    differenceDirection?: 'more' | 'less';
    expectedAmount?: number;
    expectedCurrencyCode?: string;
  };
  isSelected?: boolean;
  isSelectionModeActive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function PlannedPaymentHistoryCard({
  testID,
  journalAmount,
  currencyCode,
  journalDate,
  journalTitle,
  plannedTitle,
  plannedAmount,
  plannedCurrencyCode,
  presentation,
  isSelected,
  isSelectionModeActive,
  onPress,
  onLongPress,
}: PlannedPaymentHistoryCardProps) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const date = formatDate(journalDate);
  const formattedAmount = presentation.isSkipped ? '—' : formatMoney(journalAmount, currencyCode);
  const expectedAmount =
    presentation.expectedAmount ??
    (currencyCode !== plannedCurrencyCode ? plannedAmount : undefined);
  const expectedCurrencyCode =
    presentation.expectedCurrencyCode ?? (expectedAmount == null ? undefined : plannedCurrencyCode);
  const subtitle =
    presentation.differenceAmount != null && presentation.differenceCurrencyCode
      ? presentation.differenceDirection === 'more'
        ? copy.paidMore(
            formatMoney(presentation.differenceAmount, presentation.differenceCurrencyCode),
          )
        : copy.paidLess(
            formatMoney(presentation.differenceAmount, presentation.differenceCurrencyCode),
          )
      : expectedAmount != null && expectedCurrencyCode
        ? `${presentation.subtitle} · ${copy.usualAmount} ${formatMoney(expectedAmount, expectedCurrencyCode)}`
        : presentation.subtitle;
  const titleChanged = journalTitle !== plannedTitle;
  const paidAmountWarning = presentation.label === copy.paid && presentation.color === 'warning';

  const content = (
    <Row
      align="center"
      gap="sm"
      flexWrap="wrap"
      paddingHorizontal="md"
      paddingVertical="sm"
      style={{ minHeight: 64 }}
    >
      {isSelectionModeActive ? (
        <AppIcon
          name={isSelected ? Icon.CheckSquare : Icon.Square}
          size={20}
          color={isSelected ? theme.primary : theme.textTertiary}
        />
      ) : (
        <View
          accessible={false}
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.surfaceSecondary,
          }}
        >
          <AppIcon
            name={presentation.dotIcon}
            size={14}
            color={
              getVariantColors(theme, () => theme.text, paidAmountWarning ? 'secondary' : presentation.color).main
            }
          />
        </View>
      )}
      <Column flexGrow={1} flexShrink={1} flexBasis={120} gap="xs" style={{ minWidth: 0 }}>
        <AppText
          variant="body"
          weight="semibold"
          color={paidAmountWarning ? 'text' : presentation.color}
        >
          {date}
        </AppText>
        <AppText
          variant="caption"
          color={paidAmountWarning || presentation.color === 'warning' ? 'warning' : 'secondary'}
        >
          {subtitle}
        </AppText>
      </Column>
      {presentation.isSkipped ? (
        <AppText variant="body" color="secondary">
          —
        </AppText>
      ) : (
        <MoneyText
          amount={journalAmount}
          currencyCode={currencyCode}
          variant="body"
          weight="semibold"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.2}
          style={{ maxWidth: '100%', flexShrink: 1, marginLeft: 'auto' }}
        />
      )}
    </Row>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={200}
      activeOpacity={Opacity.heavy}
      accessibilityRole="button"
      accessibilityLabel={
        titleChanged
          ? `${copy.historyRowLabel(date, presentation.label, formattedAmount)}, ${journalTitle}`
          : copy.historyRowLabel(date, presentation.label, formattedAmount)
      }
      testID={testID}
      accessibilityState={isSelectionModeActive ? { selected: !!isSelected } : undefined}
      style={isSelected ? { backgroundColor: theme.surfaceSecondary } : undefined}
    >
      {content}
    </TouchableOpacity>
  );
}
