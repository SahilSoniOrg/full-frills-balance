import { AppConfig, Opacity, withOpacity } from '@/src/constants';
import { CurrencySelector } from '@/src/features/accounts';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { PlainCurrency } from '@/src/types/plainDtos';
import { useTheme } from '@/src/hooks/use-theme';

interface CurrencyPreferenceViewProps {
  selectedCurrency: string;
  currencies: PlainCurrency[];
  workplaceName: string;
  onSelect: (code: string) => Promise<void>;
}

export const CurrencyPreferenceView = ({
  selectedCurrency,
  currencies,
  workplaceName,
  onSelect,
}: CurrencyPreferenceViewProps) => {
  const { theme } = useTheme();

  return (
    <SettingsMenuItem
      title={AppConfig.strings.settings.currency.title}
      description={`${AppConfig.strings.settings.currency.description} for ${workplaceName || 'current workplace'}`}
      hasArrow={false}
      rightContent={
        <CurrencySelector
          selectedCurrency={selectedCurrency}
          currencies={currencies}
          onSelect={onSelect}
          variant="pill"
          title={AppConfig.strings.settings.currency.selectTitle}
          selectedBackgroundColor={withOpacity(theme.primary, Opacity.soft / 2)}
        />
      }
    />
  );
};
