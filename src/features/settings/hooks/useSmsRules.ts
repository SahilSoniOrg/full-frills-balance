import { useAccounts } from '@/src/features/accounts';
import { useObservable } from '@/src/hooks/useObservable';
import { SmsRuleSuggestion } from '@/src/services/sms/SmsRuleEngine';
import { smsService } from '@/src/services/sms-service';
import { smsRuleReadService } from '@/src/services/sms/smsRuleReadService';
import { PlainSmsRule } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { useMemo } from 'react';
import { from } from 'rxjs';

export function useSmsRules(workplaceId: WorkplaceId) {
  const { data: rules = [] } = useObservable(
    () => smsRuleReadService.observeAll(workplaceId),
    [workplaceId],
    [] as PlainSmsRule[],
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
