import { AppConfig } from '@/src/constants';
import { getDefaultSubtypeForType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountId, WorkplaceId, AccountSubtype, AccountType } from '@/src/types/domain';
import { IconName } from '@/src/types/domainIcons';

export async function findAccountByName(
  workplaceId: WorkplaceId,
  name: string,
): Promise<import('@/src/data/models/Account').default | null> {
  return accountRepository.findByName(workplaceId, name);
}

export async function getOpeningBalancesAccountId(
  currencyCode: string,
  workplaceId: WorkplaceId,
): Promise<AccountId> {
  const { openingBalances } = AppConfig.systemAccounts;
  const name = `${openingBalances.namePrefix} (${currencyCode})`;
  const existing = await findAccountByName(workplaceId, name);
  if (existing) return existing.id as AccountId;

  return (
    await accountRepository.create({
      name,
      accountType: AccountType.EQUITY,
      accountSubtype: getDefaultSubtypeForType(AccountType.EQUITY),
      currencyCode,
      description: openingBalances.description,
      icon: openingBalances.icon as IconName,
      workplaceId,
    })
  ).id as AccountId;
}

export async function findOrCreateBalanceCorrectionAccount(
  currencyCode: string,
  workplaceId: WorkplaceId,
): Promise<AccountId> {
  const { balanceCorrections } = AppConfig.systemAccounts;
  let targetCurrency = currencyCode;
  if (!targetCurrency) {
    targetCurrency = await workplaceService.getCurrency(workplaceId);
  }

  for (const legacyName of balanceCorrections.legacyNames) {
    const legacy = await findAccountByName(workplaceId, legacyName);
    if (legacy && (legacy.currencyCode === targetCurrency || !legacy.currencyCode)) {
      return legacy.id as AccountId;
    }
  }

  const name = `${balanceCorrections.namePrefix} (${targetCurrency})`;
  const existing = await findAccountByName(workplaceId, name);
  if (existing) return existing.id as AccountId;

  const allAccounts = await accountRepository.findAll(workplaceId);
  const fallback = allAccounts.find(
    a =>
      a.name.includes(balanceCorrections.namePrefix) &&
      a.currencyCode === targetCurrency &&
      !a.deletedAt,
  );
  if (fallback) return fallback.id as AccountId;

  return (
    await accountRepository.create({
      name,
      accountType: AccountType.EQUITY,
      accountSubtype: AccountSubtype.OPENING_BALANCE,
      currencyCode: targetCurrency,
      description: balanceCorrections.description,
      icon: balanceCorrections.icon as IconName,
      workplaceId,
    })
  ).id as AccountId;
}
