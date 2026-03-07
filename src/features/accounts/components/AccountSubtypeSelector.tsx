import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import {
    AccountSubtype,
    AccountType,
    formatAccountSubtypeLabel,
    getAccountSubtypesForType,
} from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountAccentColor } from '@/src/utils/accountCategory';
import React, { useMemo } from 'react';

interface AccountSubtypeSelectorProps {
    accountType: AccountType;
    value: AccountSubtype;
    onChange: (subtype: AccountSubtype) => void;
    disabled?: boolean;
}

export const AccountSubtypeSelector: React.FC<AccountSubtypeSelectorProps> = ({
    accountType,
    value,
    onChange,
    disabled,
}) => {
    const { theme } = useTheme();
    const subtypes = getAccountSubtypesForType(accountType);
    const accountColor = getAccountAccentColor(accountType, theme);

    const items = useMemo(() => {
        return subtypes.map((subtype) => ({
            id: subtype,
            label: formatAccountSubtypeLabel(subtype),
            color: accountColor,
        }));
    }, [subtypes, accountColor]);

    return (
        <SelectionTileList
            items={items}
            selectedId={value}
            onSelect={(id) => {
                if (id) {
                    onChange(id as AccountSubtype);
                }
            }}
            disabled={disabled}
            testIDPrefix="account-subtype-option"
        />
    );
};

