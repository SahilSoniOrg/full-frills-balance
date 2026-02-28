import { useRouter } from 'expo-router';
import { useCallback } from 'react';

interface UseReportActionsProps {
    router: ReturnType<typeof useRouter>;
    selectedPeriod: { start: number; end: number } | null;
    dateRange: { startDate: number; endDate: number };
}

/**
 * Hook to manage report-related actions like navigation and transaction viewing.
 */
export function useReportActions({ router, selectedPeriod, dateRange }: UseReportActionsProps) {
    const onViewTransactions = useCallback((start: number, end?: number) => {
        const startDate = new Date(start).setHours(0, 0, 0, 0);
        const endDate = end
            ? new Date(end).setHours(23, 59, 59, 999)
            : new Date(start).setHours(23, 59, 59, 999);

        router.push({
            pathname: '/journal',
            params: { startDate: startDate.toString(), endDate: endDate.toString() }
        });
    }, [router]);

    const onViewSelectedTransactions = useCallback(() => {
        if (selectedPeriod) {
            onViewTransactions(selectedPeriod.start, selectedPeriod.end);
        }
    }, [selectedPeriod, onViewTransactions]);

    const onLegendRowPress = useCallback((accountId: string) => {
        const start = selectedPeriod?.start ?? dateRange.startDate;
        const end = selectedPeriod?.end ?? dateRange.endDate;

        router.push({
            pathname: '/account-details',
            params: {
                accountId,
                startDate: start.toString(),
                endDate: end.toString(),
            },
        });
    }, [dateRange.endDate, dateRange.startDate, router, selectedPeriod]);

    return {
        onViewTransactions,
        onViewSelectedTransactions,
        onLegendRowPress,
    };
}
