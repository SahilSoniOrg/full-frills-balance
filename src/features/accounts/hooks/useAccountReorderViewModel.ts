import Account from '@/src/data/models/Account';
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

export function useAccountReorderViewModel(): AccountReorderViewModel {
    const router = useRouter();
    const { theme } = useTheme();
    const { accounts: initialAccounts, isLoading } = useAccounts();
    const { updateAccountOrder } = useAccountActions();
    const [accounts, setAccounts] = useState<Account[]>([]);

    useEffect(() => {
        if (!isLoading) {
            setAccounts([...initialAccounts]);
        }
    }, [initialAccounts, isLoading]);

    const onMove = useCallback(async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= accounts.length) return;

        const newAccounts = [...accounts];
        const item = newAccounts[index];

        newAccounts.splice(index, 1);
        newAccounts.splice(newIndex, 0, item);

        const itemBefore = newAccounts[newIndex - 1];
        const itemAfter = newAccounts[newIndex + 1];

        let newOrderNum = 0;
        if (itemBefore && itemAfter) {
            newOrderNum = ((itemBefore.orderNum || 0) + (itemAfter.orderNum || 0)) / 2;
        } else if (itemBefore) {
            newOrderNum = (itemBefore.orderNum || 0) + 1;
        } else if (itemAfter) {
            newOrderNum = (itemAfter.orderNum || 0) - 1;
        } else {
            newOrderNum = 0;
        }

        setAccounts(newAccounts);

        try {
            await updateAccountOrder(item, newOrderNum);
        } catch (error) {
            logger.error('Failed to update account order:', error);
            setAccounts([...initialAccounts]);
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
