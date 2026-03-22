import { AppConfig, Opacity, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { CurrencySelector } from '@/src/features/accounts';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import React from 'react';

export const CurrencyPreference = () => {
    const { theme } = useTheme();
    const { defaultCurrency, updateUserDetails } = useUI();
    const { currencies } = useCurrencies();

    const handleSelect = async (code: string) => {
        await updateUserDetails('', code);
    };

    return (
        <SettingsMenuItem
            title={AppConfig.strings.settings.currency.title}
            description={AppConfig.strings.settings.currency.description}
            hasArrow={false}
            rightContent={
                <CurrencySelector
                    selectedCurrency={defaultCurrency}
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
