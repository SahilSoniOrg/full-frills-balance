import { PlannedPaymentDetailsView } from '@/src/features/planned-payments/components/PlannedPaymentDetailsView';
import { usePlannedPaymentDetailsViewModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function PlannedPaymentDetailsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const vm = usePlannedPaymentDetailsViewModel(id);
    return <PlannedPaymentDetailsView {...vm} />;
}
