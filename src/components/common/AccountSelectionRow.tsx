import { ListRow } from '@/src/components/core';
import Account from '@/src/data/models/Account';
import React, { useMemo } from 'react';

type AccountSelectionRowProps = {
    title: string;
    accounts: Account[];
    selectedAccountId?: string;
    placeholder: string;
    onPress: () => void;
};

export function AccountSelectionRow({
    title,
    accounts,
    selectedAccountId,
    placeholder,
    onPress,
}: AccountSelectionRowProps) {
    const selectedAccountName = useMemo(
        () => accounts.find((account) => account.id === selectedAccountId)?.name ?? placeholder,
        [accounts, placeholder, selectedAccountId]
    );

    return (
        <ListRow
            title={title}
            subtitle={selectedAccountName}
            onPress={onPress}
        />
    );
}
