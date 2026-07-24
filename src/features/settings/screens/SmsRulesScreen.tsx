import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { useAccounts } from '@/src/features/accounts';
import { SmsRulesView } from '@/src/features/settings/components/SmsRulesView';
import { useObservable } from '@/src/hooks/useObservable';
import { SmsRuleSuggestion } from '@/src/services/sms/SmsRuleEngine';
import { smsService } from '@/src/services/sms-service';
import { withObservables } from '@nozbe/watermelondb/react';
import { useMemo } from 'react';
import { from } from 'rxjs';
import { WorkplaceId } from '@/src/types/domain';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';

interface RulesProps {
  rules: TransactionAutoPostRule[];
  workplaceId: WorkplaceId;
}

function SmsRulesContainer({ rules, workplaceId }: RulesProps) {
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

  return <SmsRulesView rules={rules} suggestions={suggestions} accountMap={accountMap} />;
}

const EnhancedSmsRulesContainer = withObservables(
  ['workplaceId'],
  ({ workplaceId }: { workplaceId: WorkplaceId }) => ({
    rules: transactionAutoPostRuleRepository.observeAllByWorkplace(workplaceId),
  }),
)(SmsRulesContainer);

export default function SmsRulesScreen() {
  const { workplaceId } = useWorkplace();
  return <EnhancedSmsRulesContainer workplaceId={workplaceId} />;
}
