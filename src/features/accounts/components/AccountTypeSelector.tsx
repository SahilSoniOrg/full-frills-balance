import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountAccentColor } from '@/src/utils/accountCategory';
import React, { useMemo } from 'react';

interface AccountTypeSelectorProps {
    value: AccountType;
    onChange: (type: AccountType) => void;
    disabled?: boolean;
}

const TYPE_METADATA: Record<AccountType, { label: string; icon: IconName }> = {
    [AccountType.ASSET]: { label: AppConfig.strings.accounts.types.asset, icon: 'wallet' },
    [AccountType.LIABILITY]: { label: AppConfig.strings.accounts.types.liability, icon: 'creditCard' },
    [AccountType.EQUITY]: { label: AppConfig.strings.accounts.types.equity, icon: 'bank' },
    [AccountType.INCOME]: { label: AppConfig.strings.accounts.types.income, icon: 'trendingUp' },
    [AccountType.EXPENSE]: { label: AppConfig.strings.accounts.types.expense, icon: 'arrowDown' },
};

export const AccountTypeSelector: React.FC<AccountTypeSelectorProps> = ({ value, onChange, disabled }) => {
    const { theme } = useTheme();

    const items = useMemo(() => {
        return (Object.keys(TYPE_METADATA) as AccountType[]).map((typeKey) => {
            const meta = TYPE_METADATA[typeKey];
            const accountColor = getAccountAccentColor(typeKey, theme);
            return {
                id: typeKey,
                label: meta.label,
                icon: meta.icon,
                color: accountColor,
            };
        });
    }, [theme]);

    return (
        <SelectionTileList
            items={items}
            selectedId={value}
            onSelect={(id) => {
                if (id) {
                    onChange(id as AccountType);
                }
            }}
            disabled={disabled}
            testIDPrefix="account-type-option"
        />
    );
};

