import { AppConfig } from '@/src/constants';
import { getDefaultSubtypeForType } from '@/src/types/accountSubtype';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountId, WorkplaceId, AccountSubtype, AccountType } from '@/src/types/domain';
import { IconName } from '@/src/types/domainIcons';

export function isSystemAccount(account: { name: string }): boolean {
  const { openingBalances, balanceCorrections } = AppConfig.systemAccounts;
  const lower = account.name.trim().toLowerCase();
  const openingPrefix = openingBalances.namePrefix.toLowerCase();
  const correctionsPrefix = balanceCorrections.namePrefix.toLowerCase();
  // Generated names are `${prefix} (${currency})`; legacy exact names also count.
  if (lower === openingPrefix || lower.startsWith(`${openingPrefix} (`)) return true;
  if (lower === correctionsPrefix || lower.startsWith(`${correctionsPrefix} (`)) return true;
  return balanceCorrections.legacyNames.some(name => lower === name.toLowerCase());
}

export async function findAccountByName(
  workplaceId: WorkplaceId,
  name: string,
): Promise<import('@/src/data/models/Account').default | null> {
  return accountQueryRepository.findByName(workplaceId, name);
}

export function getOpeningBalancesAccountInput(
  currencyCode: string,
  workplaceId: WorkplaceId,
): {
  name: string;
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  currencyCode: string;
  description: string;
  icon: IconName;
  workplaceId: WorkplaceId;
} {
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

export async function getOpeningBalancesAccountId(
  currencyCode: string,
  workplaceId: WorkplaceId,
): Promise<AccountId> {
  const input = getOpeningBalancesAccountInput(currencyCode, workplaceId);
  const existing = await findAccountByName(workplaceId, input.name);
  if (existing) return existing.id;

  return (await accountWriteRepository.create(input)).id;
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
      return legacy.id;
    }
  }

  const name = `${balanceCorrections.namePrefix} (${targetCurrency})`;
  const existing = await findAccountByName(workplaceId, name);
  if (existing) return existing.id;

  const allAccounts = await accountQueryRepository.findAll(workplaceId);
  const fallback = allAccounts.find(
    a =>
      a.name.includes(balanceCorrections.namePrefix) &&
      a.currencyCode === targetCurrency &&
      !a.deletedAt,
  );
  if (fallback) return fallback.id;

  return (
    await accountWriteRepository.create({
      name,
      accountType: AccountType.EQUITY,
      accountSubtype: AccountSubtype.OPENING_BALANCE,
      currencyCode: targetCurrency,
      description: balanceCorrections.description,
      icon: balanceCorrections.icon as IconName,
      workplaceId,
    })
  ).id;
}
