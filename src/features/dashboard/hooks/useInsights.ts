import { Pattern, patternService } from '@/src/services/insight-service';
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
        const activeSub = patternService.observePatterns().subscribe((patterns) => {
            setActivePatterns(patterns);
            setIsLoading(false);
        });
        const dismissedSub = patternService.observeDismissedPatterns().subscribe(setDismissedPatterns);

        return () => {
            activeSub.unsubscribe();
            dismissedSub.unsubscribe();
        };
    }, []);

    const dismissInsight = useCallback(async (id: string) => {
        await patternService.dismissPattern(id);
    }, []);

    const restoreInsight = useCallback(async (id: string) => {
        await patternService.undismissPattern(id);
    }, []);

    return {
        activePatterns,
        dismissedPatterns,
        isLoading,
        dismissInsight,
        restoreInsight,
    };
}
