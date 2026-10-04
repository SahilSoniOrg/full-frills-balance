import { SelectionPickerSheet } from '@/src/components/filters/SelectionPickerSheet';
import { AppConfig } from '@/src/constants';
import type { PlainCurrency } from '@/src/types/plainDtos';

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
  return (
    <SelectionPickerSheet
      visible={visible}
      title={title}
      options={currencies.map(currency => ({
        id: currency.code,
        label: currency.name,
        description: `${currency.code} · ${currency.symbol}`,
      }))}
      selectedValue={selectedCode}
      searchPlaceholder={searchPlaceholder}
      selectedBackgroundColor={selectedBackgroundColor}
      showSearch
      onClose={onClose}
      onSelect={onSelect}
    />
  );
}
