import { CurrencyPickerSheet } from '@/src/features/accounts/components/CurrencyPickerSheet';
import { Icon, AppIcon, AppText } from '@/src/components/core';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import type { PlainCurrency } from '@/src/types/plainDtos';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

interface CurrencySelectorProps {
  selectedCurrency: string;
  currencies: PlainCurrency[];
  onSelect: (currencyCode: string) => void;
  disabled?: boolean;
  title?: string;
}

/** Compact currency pill that opens {@link CurrencyPickerSheet}. */
export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  selectedCurrency,
  currencies,
  onSelect,
  disabled = false,
  title = AppConfig.strings.accounts.selectCurrency,
}) => {
  const { theme } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const selected = currencies.find(c => c.code === selectedCurrency);

  return (
    <>
      <PressScaleTouchable
        haptic="selection"
        style={[
          styles.pill,
          {
            borderColor: theme.border,
            backgroundColor: theme.surface,
            opacity: disabled ? Opacity.medium : Opacity.solid,
          },
        ]}
        onPress={() => !disabled && setShowModal(true)}
        disabled={disabled}
      >
        <AppText variant="body" weight="semibold">
          {selectedCurrency} {selected?.symbol}
        </AppText>
        <AppIcon
          name={Icon.ChevronRight}
          size={Size.sm}
          color={theme.text}
          style={{ marginLeft: Spacing.xs }}
        />
      </PressScaleTouchable>

      <CurrencyPickerSheet
        visible={showModal}
        currencies={currencies}
        selectedCurrency={selectedCurrency}
        title={title}
        onClose={() => setShowModal(false)}
        onSelect={onSelect}
      />
    </>
  );
};

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: Shape.radius.full,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
