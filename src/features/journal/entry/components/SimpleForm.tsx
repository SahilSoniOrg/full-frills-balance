import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId, AccountRole, TabType } from '@/src/types/domain';
import { StyleSheet, View } from 'react-native';
import { SimpleFormSection } from '../hooks/useSimpleJournalEditor';
import { SimpleFormAccountSections } from './SimpleFormAccountSections';
import { SimpleFormTabs } from './SimpleFormTabs';

export interface SimpleFormProps {
  type: TabType;
  setType: (type: TabType) => void;
  amount: string;
  setAmount: (amount: string) => void;
  sourceId: AccountId;
  destinationId: AccountId;
  isSubmitting: boolean;
  exchangeRate: number | null;
  isLoadingRate: boolean;
  rateError: string | null;
  isCrossCurrency: boolean;
  convertedAmount: number;
  sourceCurrency?: string;
  destCurrency?: string;
  openAccountPicker: (role: AccountRole) => void;
  handleSave: () => Promise<void>;
  accountSections: SimpleFormSection[];
}

export const SimpleForm = ({
  type,
  setType,
  amount,
  sourceId,
  destinationId,
  exchangeRate,
  isLoadingRate,
  rateError,
  isCrossCurrency,
  convertedAmount,
  sourceCurrency,
  destCurrency,
  openAccountPicker,
  accountSections,
}: SimpleFormProps) => {
  const { theme } = useTheme();

  const activeColor =
    type === 'expense' ? theme.expense : type === 'income' ? theme.income : theme.primary;

  return (
    <View style={styles.container}>
      <SimpleFormTabs type={type} setType={setType} activeColor={activeColor} />

      <SimpleFormAccountSections sections={accountSections} onSearchRequest={openAccountPicker} />

      {isCrossCurrency && sourceId && destinationId && (
        <View
          style={[styles.fxCard, { backgroundColor: withOpacity(theme.primary, Opacity.soft) }]}
        >
          {isLoadingRate ? (
            <AppText variant="caption" color="secondary">
              {AppConfig.strings.transactionFlow.fetchingRate}
            </AppText>
          ) : rateError ? (
            <AppText variant="caption" color="error">
              {rateError}
            </AppText>
          ) : exchangeRate ? (
            <View style={styles.fxContent}>
              <View style={styles.fxRateRow}>
                <AppIcon name="refresh" size={Size.iconXs} color={theme.primary} />
                <AppText variant="body" color="primary" weight="bold">
                  1 {sourceCurrency} = {exchangeRate.toFixed(4)} {destCurrency}
                </AppText>
              </View>
              {parseFloat(amount) > 0 && (
                <View style={[styles.fxTotalPill, { backgroundColor: theme.primary }]}>
                  <AppText variant="caption" weight="bold" style={{ color: theme.pureInverse }}>
                    Total: {convertedAmount.toFixed(2)} {destCurrency}
                  </AppText>
                </View>
              )}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
  },
  fxCard: {
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Shape.radius.r3,
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  fxContent: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  fxRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fxTotalPill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    ...Shape.elevation.md,
  },
});
