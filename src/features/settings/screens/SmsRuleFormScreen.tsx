import { SmsRuleFormView } from '@/src/features/settings/components/SmsRuleFormView';
import { useSmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function SmsRuleFormScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const vm = useSmsRuleFormViewModel(id);
    return <SmsRuleFormView {...vm} />;
}
