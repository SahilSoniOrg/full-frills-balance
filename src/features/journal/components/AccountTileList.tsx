import { TypedFlashList } from '@/src/components/common/TypedFlashList';
import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import React from 'react';
import { View } from 'react-native';
import { AccountTile } from './AccountTile';

export interface AccountTileListProps {
    title?: string;
    accounts: Account[];
    selectedId: string;
    onSelect: (id: string) => void;
    tintColor?: string;
    horizontal?: boolean;
}

export const AccountTileList = ({
    title,
    accounts,
    selectedId,
    onSelect,
    tintColor,
    horizontal = true,
}: AccountTileListProps) => {
    return (
        <View style={{ gap: Spacing.xs, marginVertical: Spacing.sm }}>
            {title && (
                <AppText variant="caption" weight="bold" color="tertiary" style={{ marginLeft: Spacing.xs }}>
                    {title.toUpperCase()}
                </AppText>
            )}
            <View>
                <TypedFlashList
                    data={accounts}
                    horizontal={horizontal}
                    showsHorizontalScrollIndicator={false}
                    estimatedItemSize={120}
                    initialScrollIndex={Math.max(0, accounts.findIndex(a => a.id === selectedId))}
                    renderItem={({ item: account }: { item: Account }) => (
                        <AccountTile
                            account={account}
                            isSelected={selectedId === account.id}
                            onSelect={onSelect}
                            tintColor={tintColor}
                        />
                    )}
                    contentContainerStyle={{ paddingHorizontal: horizontal ? 0 : Spacing.xs }}
                    ItemSeparatorComponent={() => <View style={horizontal ? { width: Spacing.sm } : { height: Spacing.sm }} />}
                />
            </View>
        </View>
    );
};
