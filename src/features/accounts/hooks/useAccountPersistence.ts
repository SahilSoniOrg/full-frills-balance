import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccounts';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { showErrorAlert, toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { sanitizeInput } from '@/src/utils/validation';
import { useRef, useState } from 'react';

interface PersistenceResult {
  isCreating: boolean;
  handleSave: (
    name: string,
    type: AccountType,
    subtype: AccountSubtype,
    currencyCode: string,
    icon: import('@/src/components/core').IconName,
    initialBalance?: string,
    currentBalanceData?: { balance: number },
    parentAccountId?: AccountId,
    metadata?: import('@/src/data/repositories/AccountRepository').AccountPersistenceInput['metadata'],
  ) => Promise<void>;
  handleCancel: () => void;
}

export function useAccountPersistence(
  workplaceId: WorkplaceId,
  existingAccount: Account | null | undefined,
  currentAccountId: AccountId | undefined,
  hasExistingAccounts: boolean,
): PersistenceResult {
  const { createAccount, updateAccount, adjustBalance } = useAccountActions(workplaceId);
  const [isCreating, setIsCreating] = useState(false);
  const isSubmitting = useRef(false);

  const handleCancel = () => {
    AppNavigation.back();
  };

  const handleSave = async (
    accountName: string,
    accountType: AccountType,
    accountSubtype: AccountSubtype,
    currencyCode: string,
    icon: import('@/src/components/core').IconName,
    initialBalance?: string,
    currentBalanceData?: { balance: number },
    parentAccountId?: AccountId,
    metadata?: import('@/src/data/repositories/AccountRepository').AccountPersistenceInput['metadata'],
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
          accountSubtype: accountSubtype,
          icon: icon,
          parentAccountId: parentAccountId,
          metadata: metadata,
        });

        // Check for balance adjustment
        if (currentBalanceData && initialBalance) {
          const targetBalance = parseFloat(initialBalance);
          if (
            !isNaN(targetBalance) &&
            Math.abs(targetBalance - currentBalanceData.balance) > 0.001
          ) {
            logger.info(`[AccountPersistence] Triggering balance adjustment for ${sanitizedName}`);
            await adjustBalance(updatedAccount, targetBalance);
          }
        }

        toast.success(`"${sanitizedName}" has been updated successfully!`);
        logger.info('[AccountPersistence] Account updated, calling back()');
        AppNavigation.back();
      } else {
        logger.info(`[AccountPersistence] Creating account ${sanitizedName}...`);
        await createAccount({
          name: sanitizedName,
          accountType: accountType,
          accountSubtype: accountSubtype,
          currencyCode: currencyCode,
          initialBalance: initialBalance ? parseFloat(initialBalance) : 0,
          icon: icon,
          parentAccountId: parentAccountId,
          metadata: metadata,
        });

        toast.success(`"${sanitizedName}" has been created successfully!`);

        if (hasExistingAccounts) {
          AppNavigation.back();
        } else {
          AppNavigation.toAccounts();
        }
      }
    } catch (error) {
      logger.error('Error saving account:', error);
      showErrorAlert(
        error,
        currentAccountId ? 'Failed to Update Account' : 'Failed to Create Account',
        __DEV__,
      );
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
