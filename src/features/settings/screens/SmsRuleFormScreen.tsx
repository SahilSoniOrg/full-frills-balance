import { SmsRuleFormView } from '@/src/features/settings/components/SmsRuleFormView';
import { useSmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function SmsRuleFormScreen() {
    const params = useLocalSearchParams<{
        id: string;
        senderMatch?: string;
        bodyMatch?: string;
        sourceAccountId?: string;
        categoryAccountId?: string;
    }>();
    const vm = useSmsRuleFormViewModel(params.id, {
        senderMatch: params.senderMatch,
        bodyMatch: params.bodyMatch,
        sourceAccountId: params.sourceAccountId,
        categoryAccountId: params.categoryAccountId,
    });
    return <SmsRuleFormView {...vm} />;
}
