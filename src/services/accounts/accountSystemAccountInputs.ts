import { AppConfig } from '@/src/constants/app-config';
import { getDefaultSubtypeForType } from '@/src/types/accountSubtype';
import { IconName } from '@/src/types/domainIcons';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

export function getOpeningBalancesAccountInput(currencyCode: string, workplaceId: WorkplaceId) {
  const { openingBalances } = AppConfig.systemAccounts;
  return {
    name: `${openingBalances.namePrefix} (${currencyCode})`,
    accountType: AccountType.EQUITY,
    accountSubtype: getDefaultSubtypeForType(AccountType.EQUITY),
    currencyCode,
    description: openingBalances.description,
    icon: openingBalances.icon as IconName,
    workplaceId,
  };
}

export function getBalanceCorrectionAccountInput(currencyCode: string, workplaceId: WorkplaceId) {
  const { balanceCorrections } = AppConfig.systemAccounts;
  return {
    name: `${balanceCorrections.namePrefix} (${currencyCode})`,
    accountType: AccountType.EQUITY,
    accountSubtype: AccountSubtype.OPENING_BALANCE,
    currencyCode,
    description: balanceCorrections.description,
    icon: balanceCorrections.icon as IconName,
    workplaceId,
  };
}
