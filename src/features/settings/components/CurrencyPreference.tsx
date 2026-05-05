import { AppConfig, Opacity, withOpacity } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { CurrencySelector } from '@/src/features/accounts';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { workplaceService } from '@/src/services/WorkplaceService';
import React from 'react';

export const CurrencyPreference = () => {
  const { theme } = useTheme();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { currencies } = useCurrencies();
  const [workplaceName, setWorkplaceName] = React.useState('');

  React.useEffect(() => {
    const sub = workplaceService.observeWorkplace(workplaceId).subscribe(w => {
      if (w) setWorkplaceName(w.name);
    });
    return () => sub.unsubscribe();
  }, [workplaceId]);

  const handleSelect = async (code: string) => {
    await workplaceService.updateWorkplace(workplaceId, { defaultCurrencyCode: code });
  };

  return (
    <SettingsMenuItem
      title={AppConfig.strings.settings.currency.title}
      description={`${AppConfig.strings.settings.currency.description} for ${workplaceName || 'current workplace'}`}
      hasArrow={false}
      rightContent={
        <CurrencySelector
          selectedCurrency={workplaceCurrency}
          currencies={currencies}
          onSelect={handleSelect}
          variant="pill"
          title={AppConfig.strings.settings.currency.selectTitle}
          selectedBackgroundColor={withOpacity(theme.primary, Opacity.soft / 2)}
        />
      }
    />
  );
};
