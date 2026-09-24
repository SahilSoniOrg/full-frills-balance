import { AppConfig } from '@/src/constants';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import {
  getBalanceCorrectionAccountInput,
  getOpeningBalancesAccountInput,
} from '@/src/data/repositories/account/accountSystemAccountInputs';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { workplaceService } from '@/src/services/WorkplaceService';
import Account from '@/src/data/models/Account';
import { AccountId, WorkplaceId } from '@/src/types/ids';
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

export async function getOpeningBalancesAccountId(
  currencyCode: string,
  workplaceId: WorkplaceId,
): Promise<AccountId> {
  const input = getOpeningBalancesAccountInput(currencyCode, workplaceId);
  const existing = await findAccountByName(workplaceId, input.name);
  if (existing) return existing.id;

  return (await accountWriteRepository.create(input)).id;
}

export async function findOrCreateBalanceCorrectionAccountInSession(
  session: AccountingWriteSession,
  currencyCode: string,
  workplaceId: WorkplaceId,
): Promise<Account> {
  const existing = await findBalanceCorrectionAccount(currencyCode, workplaceId);
  if (existing) return existing;

  const targetCurrency = currencyCode || (await workplaceService.getCurrency(workplaceId));
  return accountWriteRepository.createInSession(
    session,
    getBalanceCorrectionAccountInput(targetCurrency, workplaceId),
  );
}

async function findBalanceCorrectionAccount(
  currencyCode: string,
  workplaceId: WorkplaceId,
): Promise<Account | null> {
  const { balanceCorrections } = AppConfig.systemAccounts;
  const targetCurrency = currencyCode || (await workplaceService.getCurrency(workplaceId));

  for (const legacyName of balanceCorrections.legacyNames) {
    const legacy = await findAccountByName(workplaceId, legacyName);
    if (legacy && (legacy.currencyCode === targetCurrency || !legacy.currencyCode)) {
      return legacy;
    }
  }

  const input = getBalanceCorrectionAccountInput(targetCurrency, workplaceId);
  const existing = await findAccountByName(workplaceId, input.name);
  if (existing) return existing;

  const allAccounts = await accountQueryRepository.findAll(workplaceId);
  const fallback = allAccounts.find(
    a =>
      a.name.includes(balanceCorrections.namePrefix) &&
      a.currencyCode === targetCurrency &&
      !a.deletedAt,
  );
  return fallback ?? null;
}
