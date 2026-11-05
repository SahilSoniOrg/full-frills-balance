import type { SmsAccountRecognition } from '@/src/types/accountMatcher';
import type { AccountId } from '@/src/types/ids';

export interface AccountFlowRoles {
  sourceAccountId?: AccountId;
  destinationAccountId?: AccountId;
  isAmbiguous: boolean;
}

/** Only explicit declarations assign roles. Either matches remain unresolved candidates. */
export function resolveAccountFlowRoles(
  recognition: Pick<SmsAccountRecognition, 'status' | 'accountIds' | 'flows'>,
): AccountFlowRoles {
  if (recognition.status !== 'recognized' || !recognition.flows?.length) {
    return { isAmbiguous: false };
  }
  const accountIds = new Set(recognition.accountIds);
  if (accountIds.size > 2) return { isAmbiguous: true };
  let sourceAccountId: AccountId | undefined;
  let destinationAccountId: AccountId | undefined;
  for (const { accountId, flow } of recognition.flows) {
    if (!accountIds.has(accountId)) continue;
    if (flow === 'outgoing') {
      if (sourceAccountId && sourceAccountId !== accountId) return { isAmbiguous: true };
      sourceAccountId = accountId;
    } else if (flow === 'incoming') {
      if (destinationAccountId && destinationAccountId !== accountId) return { isAmbiguous: true };
      destinationAccountId = accountId;
    }
  }
  if (sourceAccountId && sourceAccountId === destinationAccountId) return { isAmbiguous: true };
  return {
    ...(sourceAccountId ? { sourceAccountId } : {}),
    ...(destinationAccountId ? { destinationAccountId } : {}),
    isAmbiguous: false,
  };
}
