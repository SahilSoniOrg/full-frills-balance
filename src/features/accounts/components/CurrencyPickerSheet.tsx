import { Icon, AppInput, AppText } from '@/src/components/core';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { SelectionCheckmark } from '@/src/components/shared/SelectionIndicator';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import {
  filterCurrencyPickerSections,
  toCurrencyPickerSections,
  type CurrencyPickerRow,
} from '@/src/features/accounts/helpers/currencyPickerOptions';
import { useTheme } from '@/src/hooks/use-theme';
import type { PlainCurrency } from '@/src/types/plainDtos';
import { withOpacity } from '@/src/utils/color-math';
import { useMemo, useState } from 'react';
import { Keyboard, SectionList, StyleSheet, View } from 'react-native';

type CurrencyPickerSheetProps = {
  visible: boolean;
  currencies: readonly PlainCurrency[];
  selectedCurrency: string;
  onSelect: (currencyCode: string) => void;
  onClose: () => void;
  title?: string;
};

const BADGE_INSET = Size.xl + Spacing.md + Spacing.sm;

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
  const [searchQuery, setSearchQuery] = useState('');

  const sections = useMemo(
    () =>
      filterCurrencyPickerSections(
        toCurrencyPickerSections(currencies, selectedCurrency),
        searchQuery,
      ),
    [currencies, searchQuery, selectedCurrency],
  );

  const closeAndReset = () => {
    setSearchQuery('');
    onClose();
  };

  const handleSelect = (code: string) => {
    onSelect(code);
    Keyboard.dismiss();
    closeAndReset();
  };

  const wash = withOpacity(theme.primary, Opacity.selection);

  const renderRow = (item: CurrencyPickerRow) => {
    const isSelected = selectedCurrency === item.id;
    return (
      <PressScaleTouchable
        pressScale="subtle"
        haptic="selection"
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        style={[styles.row, isSelected && { backgroundColor: wash, borderRadius: Shape.radius.r2 }]}
        onPress={() => handleSelect(item.id)}
      >
        <View style={[styles.badge, { backgroundColor: theme.surfaceSecondary }]}>
          <AppText
            variant="caption"
            weight="bold"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            style={styles.badgeText}
          >
            {item.symbol}
          </AppText>
        </View>
        <AppText variant="body" weight="semibold" numberOfLines={1} style={styles.name}>
          {item.name}
        </AppText>
        <AppText variant="caption" color="secondary" weight="medium" style={styles.code}>
          {item.code}
        </AppText>
        <SelectionCheckmark selected={isSelected} size={18} />
      </PressScaleTouchable>
    );
  };

  return (
    <ModalSurface
      keyboardAvoiding
      visible={visible}
      title={title}
      onClose={closeAndReset}
      position="bottomSheet"
      fixedHeight
      scrollable={false}
      maxHeightPercent={80}
      contentStyle={styles.body}
      accessibilityCloseLabel="Close currency picker"
    >
      <View style={styles.search}>
        <AppInput
          placeholder={AppConfig.strings.onboarding.currency.searchPlaceholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={Icon.Search}
        />
      </View>
      <SectionList
        keyboardShouldPersistTaps="always"
        sections={sections}
        keyExtractor={item => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={[styles.sectionHeader, { backgroundColor: theme.surface }]}>
              <AppText variant="caption" color="secondary" weight="bold">
                {section.title.toUpperCase()}
              </AppText>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => (
          <View
            style={[styles.divider, { backgroundColor: theme.border, marginLeft: BADGE_INSET }]}
          />
        )}
        renderItem={({ item }) => renderRow(item)}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText variant="body" color="secondary" style={styles.emptyText}>
              {AppConfig.strings.onboarding.currency.emptySearch}
            </AppText>
          </View>
        }
      />
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    gap: 0,
  },
  search: {
    paddingBottom: Spacing.sm,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: Spacing.xl,
  },
  sectionHeader: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Size.rowMin,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
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
  name: {
    flex: 1,
    minWidth: 0,
  },
  code: {
    flexShrink: 0,
    marginRight: Spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  empty: {
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
});
