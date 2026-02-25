import PlannedPayment from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { useObservable } from '@/src/hooks/useObservable';
import { useMemo } from 'react';

export function usePlannedPayments() {
    const observable = useMemo(() => plannedPaymentRepository.observeAll(), []);

    const { data: items, isLoading } = useObservable<PlannedPayment[]>(
        () => observable,
        [],
        [] as PlannedPayment[]
    );

    return {
        items,
        isLoading,
    };
}
