import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import {
  resolveExchangeRatePresentation,
  resolveSimpleTypeAccentColor,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/ids';
import { AccountRole, TabType } from '@/src/types/domainJournal';
import { StyleSheet, View } from 'react-native';
import { SimpleFormSection } from '../hooks/useSimpleJournalEditor';
import { SimpleFormAccountSections } from './SimpleFormAccountSections';
import { SimpleFormTabs } from './SimpleFormTabs';

export interface SimpleFormProps {
  type: TabType;
  setType: (type: TabType) => void;
  amount: string;
  sourceId: AccountId;
  destinationId: AccountId;
  exchangeRate: number | null;
  isLoadingRate: boolean;
  rateError: string | null;
  isCrossCurrency: boolean;
  convertedAmount: number;
  sourceCurrency?: string;
  destCurrency?: string;
  openAccountPicker: (role: AccountRole) => void;
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

  const activeColor = resolveSimpleTypeAccentColor(type, theme);
  const displayedRate = exchangeRate
    ? resolveExchangeRatePresentation({
        sourceCurrency,
        destinationCurrency: destCurrency,
        exchangeRate,
      })
    : null;

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
          ) : displayedRate ? (
            <View style={styles.fxContent}>
              <View style={styles.fxRateRow}>
                <AppIcon name="refresh" size={Size.iconXs} color={theme.primary} />
                <AppText variant="body" color="primary" weight="bold">
                  1 {displayedRate.sourceCurrency} = {displayedRate.exchangeRate.toFixed(4)}{' '}
                  {displayedRate.destinationCurrency}
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
