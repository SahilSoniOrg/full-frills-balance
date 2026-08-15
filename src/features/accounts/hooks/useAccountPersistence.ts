import Account from '@/src/data/models/Account';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { isCategoryAccountType } from '@/src/features/accounts/helpers/accountFormHelpers';
import { AccountSavePayload } from '@/src/features/accounts/services/accountFormService';
import { analytics } from '@/src/services/analytics-service';
import {
  BalanceChangeCounterparty,
  resolveBalanceChangeRequirement,
} from '@/src/services/accounts/balanceChangeClassification';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { showErrorAlert, toast } from '@/src/utils/alerts';
import { ValidationError } from '@/src/utils/errors';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { sanitizeInput } from '@/src/utils/validation';
import { useRef, useState } from 'react';

export type AccountPersistenceSaveInput = {
  payload: AccountSavePayload;
  balanceChange?: BalanceChangeCounterparty;
};

interface PersistenceResult {
  isCreating: boolean;
  handleSave: (input: AccountPersistenceSaveInput) => Promise<void>;
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

  const handleSave = async ({ payload, balanceChange }: AccountPersistenceSaveInput) => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setIsCreating(true);

    const sanitizedName = sanitizeInput(payload.accountName);

    try {
      if (currentAccountId && existingAccount) {
        const isTypeChanged = existingAccount.accountType !== payload.accountType;
        if (isTypeChanged) {
          analytics.trackFeatureUsage('account', 'convert_type', {
            from_type: existingAccount.accountType,
            to_type: payload.accountType,
            is_category_to_account:
              isCategoryAccountType(existingAccount.accountType) &&
              !isCategoryAccountType(payload.accountType),
            is_account_to_category:
              !isCategoryAccountType(existingAccount.accountType) &&
              isCategoryAccountType(payload.accountType),
          });
        }

        const updatedAccount = await updateAccount(existingAccount, {
          name: sanitizedName,
          accountType: payload.accountType,
          accountSubtype: payload.accountSubtype,
          icon: payload.selectedIcon,
          color: payload.selectedColor,
          parentAccountId: payload.parentAccountId,
          metadata: payload.metadata,
        });

        const targetBalance = payload.initialBalance ? parseFloat(payload.initialBalance) : NaN;
        const adjustment = resolveBalanceChangeRequirement({
          canAdjustBalance: !isCategoryAccountType(updatedAccount.accountType),
          targetBalance,
          currentBalance: payload.balanceData?.balance,
          balanceChange,
        });

        if (adjustment.shouldAdjust) {
          logger.info(`[AccountPersistence] Triggering balance adjustment for ${sanitizedName}`);
          await adjustBalance(updatedAccount, targetBalance, adjustment.balanceChange);
        }

        toast.success(`"${sanitizedName}" has been updated successfully!`);
        logger.info('[AccountPersistence] Account updated, calling back()');
        AppNavigation.back();
      } else {
        logger.info(`[AccountPersistence] Creating account ${sanitizedName}...`);
        await createAccount({
          name: sanitizedName,
          accountType: payload.accountType,
          accountSubtype: payload.accountSubtype,
          currencyCode: payload.selectedCurrency,
          initialBalance: payload.initialBalance ? parseFloat(payload.initialBalance) : 0,
          icon: payload.selectedIcon,
          color: payload.selectedColor || undefined,
          parentAccountId: payload.parentAccountId,
          metadata: payload.metadata,
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
      const message =
        error instanceof Error && error.message.includes('classifying') ? error.message : undefined;
      showErrorAlert(
        message ? new ValidationError(message) : error,
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
