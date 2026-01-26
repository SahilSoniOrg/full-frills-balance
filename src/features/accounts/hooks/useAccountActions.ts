import Account, { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';

export function useAccountActions() {
    /**
     * Create a new account
     */
    const createAccount = async (data: {
        name: string;
        accountType: AccountType;
        currencyCode: string;
        initialBalance: number;
    }) => {
        return accountRepository.create(data);
    };

    /**
     * Update an existing account
     */
    const updateAccount = async (account: Account, data: {
        name?: string;
        accountType?: AccountType;
    }) => {
        return accountRepository.update(account, data);
    };

    /**
     * Soft delete an account (marks it as deleted)
     */
    const deleteAccount = async (account: Account) => {
        return accountRepository.delete(account);
    };

    return {
        createAccount,
        updateAccount,
        deleteAccount,
    };
}
