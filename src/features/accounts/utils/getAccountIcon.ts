import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { IconName } from '@/src/components/core/AppIcon';

/**
 * reliable way to get an icon for an account, 
 * handling special cases for system accounts (OBE, Balance Corrections)
 * that might have been created without an icon in older versions.
 */
export function getAccountIcon(account: Account): IconName {
    if (account.icon) return account.icon as IconName;

    const { openingBalances, balanceCorrections } = AppConfig.systemAccounts;
    const lowerName = account.name.toLowerCase();

    // Opening Balances (OBE)
    if (lowerName.includes(openingBalances.namePrefix.toLowerCase())) {
        return openingBalances.icon as IconName;
    }

    // Balance Corrections
    if (lowerName.includes(balanceCorrections.namePrefix.toLowerCase())) {
        return balanceCorrections.icon as IconName;
    }

    // Default fallback
    return 'wallet';
}
