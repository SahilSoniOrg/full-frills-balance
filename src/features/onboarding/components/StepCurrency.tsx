import { SelectableGrid, SelectableItem } from '@/src/components/common/SelectableGrid';
import { Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { AppText } from '@/src/components/core';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { COMMON_CURRENCY_CODES } from '@/src/services/currency-init-service';
import React, { useMemo, useState } from 'react';

interface StepCurrencyProps {
    selectedCurrency: string;
    onSelect: (code: string) => void;
    onContinue: () => void;
    onBack: () => void;
    isCompleting: boolean;
}

export const StepCurrency: React.FC<StepCurrencyProps> = ({
    selectedCurrency,
    onSelect,
    onContinue,
    onBack,
    isCompleting,
}) => {
    const { currencies } = useCurrencies();
    const { theme } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');

    const items: SelectableItem[] = useMemo(() => {
        const filteredCurrencies = searchQuery.trim()
            ? currencies.filter(c =>
                c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.code.toLowerCase().includes(searchQuery.toLowerCase())
            ).slice(0, 50)
            : currencies.filter(c => COMMON_CURRENCY_CODES.slice(0, 10).includes(c.code));

        return filteredCurrencies.map(c => ({
            id: c.code,
            name: c.code,
            symbol: c.symbol,
            subtitle: c.name,
        }));
    }, [currencies, searchQuery]);

    return (
        <SelectableGrid
            title="Default Currency"
            subtitle="Select your primary currency. You can add more later."
            items={items}
            selectedIds={[selectedCurrency]}
            onToggle={onSelect}
            onContinue={onContinue}
            onBack={onBack}
            isCompleting={isCompleting}
            showSearch={true}
            searchPlaceholder="Search currency..."
            renderSubtitle={(item, isSelected) => (
                <React.Fragment>
                    <AppText
                        variant="caption"
                        color="secondary"
                        style={{
                            color: isSelected ? withOpacity(theme.primary, 0.8) : theme.textSecondary
                        }}
                    >
                        {item.subtitle}
                    </AppText>
                </React.Fragment>
            )}
        />
    );
};
