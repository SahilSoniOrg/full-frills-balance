import { accountMatcherRepository } from '@/src/data/repositories/AccountMatcherRepository';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import type AccountMatcher from '@/src/data/models/AccountMatcher';
import type { AccountMatcherSnapshot } from '@/src/types/accountMatcher';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { map } from 'rxjs/operators';
import type { PlainAccount } from '@/src/types/plainDtos';
import { ACCOUNT_MATCHER_EVIDENCE_LIMIT } from './accountMatcherEvidenceQueries';
import {
  projectAccountMatcherMembership,
  type AccountMatcherMessage,
} from './accountMatcherMembership';

export type AccountMatcherPreviewMessage = AccountMatcherMessage;

export interface AccountMatcherPreviewData {
  accounts: PlainAccount[];
  messages: AccountMatcherPreviewMessage[];
  matchers: AccountMatcherSnapshot[];
}

function toSnapshot(matcher: AccountMatcher): AccountMatcherSnapshot {
  return {
    id: matcher.id,
    accountId: matcher.accountId,
    definitionJson: matcher.definitionJson,
    conditionsKey: matcher.conditionsKey,
    isEnabled: matcher.isEnabled,
  };
}

export function observeAccountMatcherSnapshots(workplaceId: WorkplaceId, accountId: AccountId) {
  return accountMatcherRepository
    .observeForAccount(workplaceId, accountId)
    .pipe(map(matchers => matchers.map(toSnapshot)));
}

/** Read-only, bounded data for the matcher editor. It never changes inbox or journal state. */
export async function loadAccountMatcherPreviewData(
  workplaceId: WorkplaceId,
): Promise<AccountMatcherPreviewData> {
  const [messages, accounts] = await Promise.all([
    transactionInboxRepository.findRecentSms(workplaceId, ACCOUNT_MATCHER_EVIDENCE_LIMIT),
    accountQueries.findAll(workplaceId),
  ]);
  const projectedMessages = await projectAccountMatcherMembership(workplaceId, messages, accounts);
  const matchers = await accountMatcherRepository.findAllByAccountIds(
    workplaceId,
    accounts.map(account => account.id),
  );
  return { accounts, messages: projectedMessages, matchers: matchers.map(toSnapshot) };
}
