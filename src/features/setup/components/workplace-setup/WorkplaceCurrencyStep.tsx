import { SelectableGrid, type SelectableItem } from '@/src/components/shared/SelectableGrid';
import { AppInput, AppText } from '@/src/components/core';
import { Opacity } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { withOpacity } from '@/src/utils/color-math';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { orderSetupCurrencies } from '@/src/features/setup/orderSetupCurrencies';
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
  const [pinnedId] = useState(selectedCurrency);

  const currencyItems: SelectableItem[] = useMemo(() => {
    const uniqueCurrencies = Array.from(new Map(currencies.map(c => [c.code, c])).values());
    const mappedItems = uniqueCurrencies.map(currency => ({
      id: currency.code,
      name: currency.code,
      symbol: currency.symbol,
      subtitle: currency.name,
    }));
    return orderSetupCurrencies(mappedItems, pinnedId, searchQuery);
  }, [currencies, pinnedId, searchQuery]);

  return (
    <SelectableGrid
      title={copy.currency.title}
      subtitle={copy.currency.subtitle}
      items={currencyItems}
      selectedIds={[selectedCurrency]}
      onToggle={onSelectCurrency}
      onContinue={onContinue}
      onBack={onBack}
      isCompleting={isCompleting}
      headerContent={
        <AppInput
          placeholder={copy.currency.searchPlaceholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          accessibilityLabel="Search currency"
          returnKeyType="search"
        />
      }
      emptyMessage={copy.currency.emptySearch}
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
