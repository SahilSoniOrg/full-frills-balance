import Account, { AccountType } from '@/src/data/models/Account';
import { useAccountActions, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { logger } from '@/src/utils/logger';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

export interface AccountReorderViewModel {
    theme: ReturnType<typeof useTheme>['theme'];
    accounts: Account[];
    isLoading: boolean;
    onMove: (index: number, direction: 'up' | 'down') => void;
    onBack: () => void;
}

// Sort order for account types
const typeOrder = [
    AccountType.ASSET,
    AccountType.LIABILITY,
    AccountType.INCOME,
    AccountType.EXPENSE,
    AccountType.EQUITY,
];

export function useAccountReorderViewModel(): AccountReorderViewModel {
    const router = useRouter();
    const { theme } = useTheme();
    const { accounts: initialAccounts, isLoading } = useAccounts();
    const { updateAccountOrder } = useAccountActions();
    const [accounts, setAccounts] = useState<Account[]>([]);


    useEffect(() => {
        if (!isLoading) {
            const sorted = [...initialAccounts].sort((a, b) => {
                // First by Type
                const typeRankA = typeOrder.indexOf(a.accountType);
                const typeRankB = typeOrder.indexOf(b.accountType);
                if (typeRankA !== typeRankB) return typeRankA - typeRankB;

                // Then by OrderNum
                return (a.orderNum || 0) - (b.orderNum || 0);
            });
            setAccounts(sorted);
        }
    }, [initialAccounts, isLoading]);

    const onMove = useCallback(async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= accounts.length) return;

        // Prevent moving across account types
        if (accounts[index].accountType !== accounts[newIndex].accountType) return;

        const newAccounts = [...accounts];
        const item = newAccounts[index];

        newAccounts.splice(index, 1);
        newAccounts.splice(newIndex, 0, item);

        const itemBefore = newAccounts[newIndex - 1];
        const itemAfter = newAccounts[newIndex + 1];

        // Ensure we only look at neighbors of the SAME type for order calc
        // (Though implicit since we blocked cross-type moves, good for safety)
        let newOrderNum = 0;

        // Helper to get order num safely
        const getOrder = (acc?: Account) => acc?.orderNum || 0;

        if (itemBefore && itemBefore.accountType === item.accountType && itemAfter && itemAfter.accountType === item.accountType) {
            newOrderNum = (getOrder(itemBefore) + getOrder(itemAfter)) / 2;
        } else if (itemBefore && itemBefore.accountType === item.accountType) {
            newOrderNum = getOrder(itemBefore) + 1;
        } else if (itemAfter && itemAfter.accountType === item.accountType) {
            newOrderNum = getOrder(itemAfter) - 1;
        } else {
            // First in section (or fallback)
            newOrderNum = 0;
        }

        setAccounts(newAccounts);

        try {
            await updateAccountOrder(item, newOrderNum);
        } catch (error) {
            logger.error('Failed to update account order:', error);
            setAccounts([...initialAccounts]); // Revert on failure
        }
    }, [accounts, initialAccounts, updateAccountOrder]);

    const onBack = useCallback(() => {
        router.back();
    }, [router]);

    return {
        theme,
        accounts,
        isLoading,
        onMove,
        onBack,
    };
}
