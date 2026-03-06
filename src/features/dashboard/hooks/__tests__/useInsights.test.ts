import { patternService } from '@/src/services/insight-service';
import { act, renderHook } from '@testing-library/react-native';
import { of } from 'rxjs';
import { useInsights } from '../useInsights';

// Mock patternService
jest.mock('@/src/services/insight-service', () => ({
    patternService: {
        observePatterns: jest.fn(),
        observeDismissedPatterns: jest.fn(),
        dismissPattern: jest.fn(),
        undismissPattern: jest.fn(),
    },
}));

describe('useInsights', () => {
    const mockActivePatterns = [
        { id: '1', message: 'Insight 1', type: 'slow-leak', severity: 'low' },
    ];
    const mockDismissedPatterns = [
        { id: '2', message: 'Insight 2', type: 'subscription-amnesiac', severity: 'medium' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        (patternService.observePatterns as jest.Mock).mockReturnValue(of(mockActivePatterns));
        (patternService.observeDismissedPatterns as jest.Mock).mockReturnValue(of(mockDismissedPatterns));
    });

    it('should subscribe to active and dismissed patterns', () => {
        const { result } = renderHook(() => useInsights());

        expect(patternService.observePatterns).toHaveBeenCalled();
        expect(patternService.observeDismissedPatterns).toHaveBeenCalled();
        expect(result.current.activePatterns).toEqual(mockActivePatterns);
        expect(result.current.dismissedPatterns).toEqual(mockDismissedPatterns);
    });

    it('should call dismissPattern on insightService', async () => {
        const { result } = renderHook(() => useInsights());

        await act(async () => {
            await result.current.dismissInsight('1');
        });

        expect(patternService.dismissPattern).toHaveBeenCalledWith('1');
    });

    it('should call undismissPattern on insightService', async () => {
        const { result } = renderHook(() => useInsights());

        await act(async () => {
            await result.current.restoreInsight('2');
        });

        expect(patternService.undismissPattern).toHaveBeenCalledWith('2');
    });
});
