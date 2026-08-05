import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { SmsRulesView } from '@/src/features/settings/components/SmsRulesView';
import { useSmsRules } from '@/src/features/settings/hooks/useSmsRules';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';

export default function SmsRulesScreenContainer() {
  const { workplaceId } = useWorkplace();
  const { rules, suggestions, accountMap } = useSmsRules(workplaceId);

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: 'SMS Rules',
      showBack: true,
      backIcon: 'back',
      fab: {
        onPress: () => AppNavigation.toSmsRuleForm(),
        label: 'Create Rule',
        placement: 'end',
        accessibilityLabel: 'Create a new SMS rule',
      },
    }),
    [],
  );

  return (
    <SmsRulesView chrome={chrome} rules={rules} suggestions={suggestions} accountMap={accountMap} />
  );
}
