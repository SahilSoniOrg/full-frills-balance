import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import { AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountAccentColor } from '@/src/utils/accountCategory';
import React, { useMemo } from 'react';
import { View } from 'react-native';

export interface AccountTileListProps {
    title?: string;
    accounts: Account[];
    selectedId: string;
    onSelect: (id: string) => void;
}

export const AccountTileList = ({
    title,
    accounts,
    selectedId,
    onSelect,
}: AccountTileListProps) => {
    const { theme } = useTheme();

    const items = useMemo(() => {
        return accounts.map(account => ({
            id: account.id,
            label: account.name,
            icon: account.icon as IconName,
            color: getAccountAccentColor(account.accountType, theme)
        }));
    }, [accounts, theme]);

    return (
        <View style={{ gap: Spacing.xs, marginVertical: Spacing.sm }}>
            {title && (
                <AppText variant="caption" weight="bold" color="tertiary" style={{ marginLeft: Spacing.xs }}>
                    {title}
                </AppText>
            )}
            <View>
                <SelectionTileList
                    items={items}
                    selectedId={selectedId}
                    onSelect={(id) => onSelect(id)}
                    testIDPrefix="account-option"
                />
            </View>
        </View>
    );
};
