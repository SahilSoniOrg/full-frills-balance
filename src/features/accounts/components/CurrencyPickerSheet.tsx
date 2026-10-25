import { AppText } from '@/src/components/core';
import {
  SelectionPickerSheet,
  type SelectionOption,
  type SelectionSection,
} from '@/src/components/filters/SelectionPickerSheet';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { toCurrencyPickerSections } from '@/src/features/accounts/helpers/currencyPickerOptions';
import { useTheme } from '@/src/hooks/use-theme';
import type { PlainCurrency } from '@/src/types/plainDtos';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

type CurrencyPickerSheetProps = {
  visible: boolean;
  currencies: readonly PlainCurrency[];
  selectedCurrency: string;
  onSelect: (currencyCode: string) => void;
  onClose: () => void;
  title?: string;
};

/** Currency bottom sheet: popular/all sections + symbol badge rows. */
export function CurrencyPickerSheet({
  visible,
  currencies,
  selectedCurrency,
  onSelect,
  onClose,
  title = AppConfig.strings.accounts.selectCurrency,
}: CurrencyPickerSheetProps) {
  const { theme } = useTheme();

  const sections = useMemo((): SelectionSection<string>[] => {
    return toCurrencyPickerSections(currencies, selectedCurrency).map(section => ({
      title: section.title,
      data: section.data.map((row): SelectionOption<string> => ({
        id: row.id,
        label: row.name,
        meta: row.code,
        keywords: row.symbol,
        leading: (
          <View style={[styles.badge, { backgroundColor: theme.surfaceSecondary }]}>
            <AppText
              variant="caption"
              weight="bold"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              style={styles.badgeText}
            >
              {row.symbol}
            </AppText>
          </View>
        ),
      })),
    }));
  }, [currencies, selectedCurrency, theme.surfaceSecondary]);

  return (
    <SelectionPickerSheet
      visible={visible}
      title={title}
      sections={sections}
      selectedValue={selectedCurrency}
      searchPlaceholder={AppConfig.strings.onboarding.currency.searchPlaceholder}
      emptyMessage={AppConfig.strings.onboarding.currency.emptySearch}
      showSearch
      onClose={onClose}
      onSelect={onSelect}
      accessibilityCloseLabel="Close currency picker"
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    overflow: 'hidden',
  },
  badgeText: {
    textAlign: 'center',
    width: '100%',
  },
});
