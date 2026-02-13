import { useUI } from '@/src/contexts/UIContext';
import Account, { AccountType } from '@/src/data/models/Account';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccounts';
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { sanitizeInput } from '@/src/utils/validation';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

interface PersistenceResult {
    isCreating: boolean;
    handleSave: (
        name: string,
        type: AccountType,
        currencyCode: string,
        icon: string,
        initialBalance?: string,
        currentBalanceData?: { balance: number }
    ) => Promise<void>;
    handleCancel: () => void;
}

export function useAccountPersistence(
    existingAccount: Account | null | undefined,
    currentAccountId: string | undefined,
    hasExistingAccounts: boolean
): PersistenceResult {
    const router = useRouter();
    const { createAccount, updateAccount, adjustBalance } = useAccountActions();
    const { defaultCurrency } = useUI();
    const [isCreating, setIsCreating] = useState(false);
    const isSubmitting = useRef(false);

    const handleCancel = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.push('/accounts');
        }
    };

    const handleSave = async (
        accountName: string,
        accountType: AccountType,
        currencyCode: string,
        icon: string,
        initialBalance?: string,
        currentBalanceData?: { balance: number }
    ) => {
        if (isSubmitting.current) return;
        isSubmitting.current = true;
        setIsCreating(true);

        const sanitizedName = sanitizeInput(accountName);

        try {
            if (currentAccountId && existingAccount) {
                const updatedAccount = await updateAccount(existingAccount, {
                    name: sanitizedName,
                    accountType: accountType,
                    icon: icon,
                });

                // Check for balance adjustment
                if (currentBalanceData && initialBalance) {
                    const targetBalance = parseFloat(initialBalance);
                    if (!isNaN(targetBalance) && Math.abs(targetBalance - currentBalanceData.balance) > 0.001) {
                        logger.info(`[AccountPersistence] Triggering balance adjustment for ${sanitizedName}`);
                        await adjustBalance(updatedAccount, targetBalance);
                    }
                }

                showSuccessAlert(
                    'Account Updated',
                    `"${sanitizedName}" has been updated successfully!`
                );
                logger.info('[AccountPersistence] Account updated, calling back()');
                router.back();
            } else {
                logger.info(`[AccountPersistence] Creating account ${sanitizedName}...`);
                await createAccount({
                    name: sanitizedName,
                    accountType: accountType,
                    currencyCode: currencyCode,
                    initialBalance: initialBalance ? parseFloat(initialBalance) : 0,
                    icon: icon,
                });

                showSuccessAlert(
                    'Account Created',
                    `"${sanitizedName}" has been created successfully!`
                );

                if (hasExistingAccounts) {
                    if (router.canGoBack()) {
                        router.back();
                    } else {
                        router.replace('/(tabs)/accounts');
                    }
                } else {
                    router.replace('/(tabs)/accounts');
                }
            }
        } catch (error) {
            logger.error('Error saving account:', error);
            showErrorAlert(error, currentAccountId ? 'Failed to Update Account' : 'Failed to Create Account');
        } finally {
            setIsCreating(false);
            isSubmitting.current = false;
        }
    };

    return {
        isCreating,
        handleSave,
        handleCancel,
    };
}
