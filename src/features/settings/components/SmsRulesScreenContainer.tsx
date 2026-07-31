import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { SmsRulesView } from '@/src/features/settings/components/SmsRulesView';
import { useSmsRules } from '@/src/features/settings/hooks/useSmsRules';

export default function SmsRulesScreenContainer() {
  const { workplaceId } = useWorkplace();
  const { rules, suggestions, accountMap } = useSmsRules(workplaceId);

  return <SmsRulesView rules={rules} suggestions={suggestions} accountMap={accountMap} />;
}
