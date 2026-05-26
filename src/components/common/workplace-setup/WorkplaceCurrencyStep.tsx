import { SelectableGrid, SelectableItem } from '@/src/components/common/SelectableGrid';
import { AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, withOpacity } from '@/src/constants';
import { Box } from '@/src/design-system';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo, useState } from 'react';

interface WorkplaceCurrencyStepProps {
  selectedCurrency: string;
  onSelectCurrency: (code: string) => void;
  onContinue: () => void;
  onBack: () => void;
  isCompleting: boolean;
}

export function WorkplaceCurrencyStep({
  selectedCurrency,
  onSelectCurrency,
  onContinue,
  onBack,
  isCompleting,
}: WorkplaceCurrencyStepProps) {
  const { theme } = useTheme();
  const { currencies } = useCurrencies();
  const [searchQuery, setSearchQuery] = useState('');

  const currencyItems: SelectableItem[] = useMemo(() => {
    const uniqueCurrencies = Array.from(new Map(currencies.map(c => [c.code, c])).values());

    let mappedItems = uniqueCurrencies.map(currency => ({
      id: currency.code,
      name: currency.code,
      symbol: currency.symbol,
      subtitle: currency.name,
    }));

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      mappedItems = mappedItems.filter(
        i =>
          i.name.toLowerCase().includes(query) ||
          (i.subtitle && i.subtitle.toLowerCase().includes(query)),
      );
    } else if (selectedCurrency) {
      return [...mappedItems].sort((a, b) => {
        if (a.id === selectedCurrency) return -1;
        if (b.id === selectedCurrency) return 1;
        return 0;
      });
    }

    return mappedItems;
  }, [currencies, searchQuery, selectedCurrency]);

  return (
    <SelectableGrid
      title={AppConfig.strings.onboarding.currency.title}
      subtitle={AppConfig.strings.onboarding.currency.subtitle}
      items={currencyItems}
      selectedIds={[selectedCurrency]}
      onToggle={onSelectCurrency}
      onContinue={onContinue}
      onBack={onBack}
      isCompleting={isCompleting}
      disableAnimation={true}
      bottomContent={
        <Box>
          <AppInput
            placeholder={AppConfig.strings.onboarding.currency.searchPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Search currency"
          />
        </Box>
      }
      renderSubtitle={(item, isSelected) => (
        <AppText
          variant="caption"
          color="secondary"
          style={{
            color: isSelected ? withOpacity(theme.primary, Opacity.heavy) : theme.textSecondary,
          }}
        >
          {item.subtitle}
        </AppText>
      )}
    />
  );
}
