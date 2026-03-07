import { JournalStatus } from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { useJournals } from '@/src/features/journal';
import { useObservable } from '@/src/hooks/useObservable';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';
import { of } from 'rxjs';

export function usePlannedPaymentDetails(id: string) {
    const { data: item, isLoading: isItemLoading } = useObservable<PlannedPayment | null>(
        () => id ? plannedPaymentRepository.observeById(id) : of(null),
        [id],
        null
    );

    // Fetch history (linked journals)
    // We use a separate status filter to show both POSTED (past) and PLANNED (future generated) journals
    const { journals: history, isLoading: isHistoryLoading } = useJournals(
        20,
        undefined,
        undefined,
        [JournalStatus.POSTED, JournalStatus.PLANNED],
        id
    );

    const handleEdit = useCallback(() => {
        if (id) {
            AppNavigation.toPlannedPaymentForm(id);
        }
    }, [id]);

    const handleToggleStatus = useCallback(async () => {
        if (!item) return;
        const newStatus = item.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        await plannedPaymentRepository.update(item as any, { status: newStatus as any });
    }, [item]);

    const handleDelete = useCallback(async () => {
        if (!item) return;
        await plannedPaymentRepository.delete(item as any);
        AppNavigation.back();
    }, [item]);

    const handlePostNow = useCallback(async () => {
        if (!item) return;
        try {
            await plannedPaymentService.postOccurrence(item as any, item.nextOccurrence);
        } catch {
            // Error logged in service
        }
    }, [item]);

    const handleSkip = useCallback(async () => {
        if (!item) return;
        try {
            await plannedPaymentService.skipOccurrence(item as any, item.nextOccurrence);
        } catch {
            // Error logged in service
        }
    }, [item]);

    return {
        item,
        history,
        isLoading: isItemLoading || isHistoryLoading,
        handleEdit,
        handleToggleStatus,
        handleDelete,
        handlePostNow,
        handleSkip,
    };
}
