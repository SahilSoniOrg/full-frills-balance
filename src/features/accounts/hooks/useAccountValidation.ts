import { Account } from '@/src/data/models/Account';
import { sanitizeInput, validateAccountName } from '@/src/utils/validation';
import { useEffect, useState } from 'react';

export interface UseAccountValidationResult {
    formError: string | null;
    validateName: (name: string) => { isValid: boolean; error?: string };
    checkForDuplicates: (name: string) => boolean;
}

export function useAccountValidation(
    accountName: string,
    accounts: Account[],
    currentAccountId?: string
): UseAccountValidationResult {
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        if (!accountName.trim()) {
            setFormError(null);
            return;
        }

        const sanitizedName = sanitizeInput(accountName);
        const existing = accounts.find(
            a => a.name.toLowerCase() === sanitizedName.toLowerCase()
        );

        if (existing && existing.id !== currentAccountId) {
            setFormError(`Account with name "${sanitizedName}" already exists`);
        } else {
            setFormError(null);
        }
    }, [accountName, accounts, currentAccountId]);

    const validateName = (name: string) => {
        return validateAccountName(name);
    };

    const checkForDuplicates = (name: string): boolean => {
        const sanitizedName = sanitizeInput(name);
        const existing = accounts.find(
            a => a.name.toLowerCase() === sanitizedName.toLowerCase()
        );
        return !!existing && existing.id !== currentAccountId;
    };

    return {
        formError,
        validateName,
        checkForDuplicates,
    };
}
