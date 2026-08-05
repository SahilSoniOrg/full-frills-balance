import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { SmsRulesView } from '@/src/features/settings/components/SmsRulesView';
import { useSmsRules } from '@/src/features/settings/hooks/useSmsRules';
import { AppNavigation } from '@/src/utils/navigation';

export default function SmsRulesScreenContainer() {
  const { workplaceId } = useWorkplace();
  const { rules, suggestions, accountMap } = useSmsRules(workplaceId);

  return (
    <SmsRulesView
      rules={rules}
      suggestions={suggestions}
      accountMap={accountMap}
      fab={{
        onPress: () => AppNavigation.toSmsRuleForm(),
        label: 'Create Rule',
        placement: 'end',
        accessibilityLabel: 'Create a new SMS rule',
      }}
    />
  );
}
