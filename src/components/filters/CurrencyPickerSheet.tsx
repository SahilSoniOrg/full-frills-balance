import { Icon, AppIcon, AppInput, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { AppConfig, Opacity, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import type { PlainCurrency } from '@/src/types/plainDtos';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';

interface CurrencyPickerSheetProps {
  visible: boolean;
  title: string;
  currencies: PlainCurrency[];
  selectedCode: string;
  searchPlaceholder?: string;
  selectedBackgroundColor?: string;
  onClose: () => void;
  onSelect: (code: string) => void;
}

export function CurrencyPickerSheet({
  visible,
  title,
  currencies,
  selectedCode,
  searchPlaceholder = AppConfig.strings.common.searchPlaceholder,
  selectedBackgroundColor,
  onClose,
  onSelect,
}: CurrencyPickerSheetProps) {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCurrencies = useMemo(() => {
    if (!searchQuery) return currencies;
    const query = searchQuery.toLowerCase();
    return currencies.filter(
      c =>
        c.code.toLowerCase().includes(query) ||
        c.name.toLowerCase().includes(query) ||
        c.symbol.toLowerCase().includes(query),
    );
  }, [currencies, searchQuery]);

  const closeAndReset = () => {
    setSearchQuery('');
    onClose();
  };

  const handleSelect = (code: string) => {
    onSelect(code);
    Keyboard.dismiss();
    closeAndReset();
  };

  return (
    <ModalSurface
      visible={visible}
      title={title}
      onClose={closeAndReset}
      position="bottomSheet"
      fixedHeight
      scrollable={false}
      maxHeightPercent={70}
      contentStyle={styles.body}
      accessibilityCloseLabel="Close currency picker"
    >
      <View style={styles.searchContainer}>
        <AppInput
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={Icon.Search}
          containerStyle={{ marginBottom: Spacing.sm }}
        />
      </View>

      <FlatList
        keyboardShouldPersistTaps="always"
        data={filteredCurrencies}
        keyExtractor={item => item.code}
        style={styles.list}
        renderItem={({ item }) => {
          const isSelected = selectedCode === item.code;
          return (
            <TouchableOpacity
              style={[
                styles.currencyItem,
                { borderBottomColor: theme.border },
                isSelected && {
                  backgroundColor:
                    selectedBackgroundColor ?? withOpacity(theme.primary, Opacity.selection),
                },
              ]}
              onPress={() => handleSelect(item.code)}
              accessibilityLabel={`${item.name} (${item.code})`}
              accessibilityRole="button"
            >
              <View>
                <AppText variant="body">{item.name}</AppText>
                <AppText variant="caption" color="secondary">
                  {item.code}
                </AppText>
              </View>
              <View style={styles.currencyRight}>
                <AppText variant="subheading">{item.symbol}</AppText>
                {isSelected && (
                  <AppIcon
                    name={Icon.CheckCircle}
                    size={Size.iconSm}
                    color={theme.primary}
                    style={{ marginLeft: Spacing.sm }}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        }}
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
  searchContainer: {
    paddingBottom: Spacing.xs,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  currencyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 1,
  },
  currencyRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
