import { insightService, Pattern } from '@/src/services/insight-service';
import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to manage insights (active and dismissed).
 * Centralizes orchestration logic for the Insights screen.
 */
export function useInsights() {
    const [activePatterns, setActivePatterns] = useState<Pattern[]>([]);
    const [dismissedPatterns, setDismissedPatterns] = useState<Pattern[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        const activeSub = insightService.observePatterns().subscribe((patterns) => {
            setActivePatterns(patterns);
            setIsLoading(false);
        });
        const dismissedSub = insightService.observeDismissedPatterns().subscribe(setDismissedPatterns);

        return () => {
            activeSub.unsubscribe();
            dismissedSub.unsubscribe();
        };
    }, []);

    const dismissInsight = useCallback(async (id: string) => {
        await insightService.dismissPattern(id);
    }, []);

    const restoreInsight = useCallback(async (id: string) => {
        await insightService.undismissPattern(id);
    }, []);

    return {
        activePatterns,
        dismissedPatterns,
        isLoading,
        dismissInsight,
        restoreInsight,
    };
}
