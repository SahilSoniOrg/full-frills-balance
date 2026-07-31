import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { useAccounts } from '@/src/features/accounts';
import { useObservable } from '@/src/hooks/useObservable';
import { SmsRuleSuggestion } from '@/src/services/sms/SmsRuleEngine';
import { smsService } from '@/src/services/sms-service';
import { WorkplaceId } from '@/src/types/domain';
import { useMemo } from 'react';
import { from } from 'rxjs';

export function useSmsRules(workplaceId: WorkplaceId) {
  const { data: rules = [] } = useObservable(
    () => transactionAutoPostRuleRepository.observeAllByWorkplace(workplaceId),
    [workplaceId],
    [] as TransactionAutoPostRule[],
  );

  const { accounts } = useAccounts(workplaceId);
  const accountMap = useMemo(
    () => new Map(accounts.map(account => [account.id, account.name])),
    [accounts],
  );

  const { data: suggestions = [] } = useObservable(
    () => from(smsService.getRuleSuggestions(workplaceId)),
    [workplaceId, rules.length],
    [] as SmsRuleSuggestion[],
  );

  return {
    rules,
    suggestions,
    accountMap,
  };
}
