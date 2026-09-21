import type { AccountId } from '@/src/types/ids';

type AccountCreationReturn = (accountId: AccountId) => void;

const pendingReturns = new Map<string, AccountCreationReturn>();
let nextToken = 0;

export function registerAccountCreationReturn(onCreated: AccountCreationReturn): string {
  nextToken += 1;
  const token = `account-return-${Date.now()}-${nextToken}`;
  pendingReturns.set(token, onCreated);
  return token;
}

export function resolveAccountCreationReturn(
  token: string | undefined,
  accountId: AccountId,
): void {
  if (!token) return;

  const onCreated = pendingReturns.get(token);
  if (!onCreated) return;

  pendingReturns.delete(token);
  onCreated(accountId);
}

export function discardAccountCreationReturn(token: string | undefined): void {
  if (token) pendingReturns.delete(token);
}
