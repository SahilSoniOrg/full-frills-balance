import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { of } from 'rxjs';

describe('usePaginatedObservable', () => {
    it('should load initial data', async () => {
        const observe = jest.fn().mockReturnValue(of(['a', 'b']));
        const { result } = renderHook(() => usePaginatedObservable({
            pageSize: 2,
            observe
        }));

        await waitFor(() => {
            expect(result.current.items).toEqual(['a', 'b']);
            expect(result.current.isLoading).toBe(false);
        });
        expect(observe).toHaveBeenCalledWith(2, undefined, undefined);
    });

    it('should handle pagination (loadMore)', async () => {
        const observe = jest.fn((_limit, _range) => {
            // Return enough items to satisfy "hasMore" check (items.length >= limit)
            // Limit starts at 10. We need at least 10 items for first page, or more for loadMore
            return of(Array.from({ length: 25 }, (_, i) => `item-${i}`))
        });
        const { result } = renderHook(() => usePaginatedObservable({
            observe,
            pageSize: 10
        }));

        // Initial load
        await waitFor(() => {
            expect(result.current.items.length).toBe(25);
        });

        // Load more
        act(() => result.current.loadMore());

        // Wait for limit to update
        await waitFor(() => {
            expect(observe).toHaveBeenCalledWith(20, undefined, undefined);
        });

        expect(observe).toHaveBeenLastCalledWith(20, undefined, undefined);
    });

    it('should set hasMore to false when fewer items returned than limit', async () => {
        // Limit is 10, but only 5 returned -> no more items
        const observe = jest.fn().mockReturnValue(of([1, 2, 3, 4, 5]));
        const { result } = renderHook(() => usePaginatedObservable({
            pageSize: 10,
            observe
        }));

        await waitFor(() => {
            expect(result.current.hasMore).toBe(false);
        });
    });

    it('should reset pagination when dateRange changes', async () => {
        const observe = jest.fn((_limit, _range) => of([]));
        const initialRange = { startDate: 100, endDate: 200 };
        const newRange = { startDate: 300, endDate: 400 };

        const { result, rerender } = renderHook((props: any) => usePaginatedObservable({
            observe,
            pageSize: 10,
            dateRange: props.range
        }), {
            initialProps: { range: initialRange }
        });

        // Initial load
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // Simulate loadMore to increase limit
        act(() => result.current.loadMore());
        // Verify limit increased
        await waitFor(() => expect(observe).toHaveBeenCalledWith(10, initialRange, undefined));

        // Change date range
        rerender({ range: newRange });

        // Should reset to page size (10)
        await waitFor(() => {
            expect(observe).toHaveBeenCalledWith(10, newRange, undefined);
        });
    });

    it('should enrich items if enrich function provided', async () => {
        const observe = jest.fn().mockReturnValue(of(['raw']));
        const enrich = jest.fn().mockResolvedValue(['enriched']);

        const { result } = renderHook(() => usePaginatedObservable({
            pageSize: 10,
            observe,
            enrich
        }));

        await waitFor(() => {
            expect(result.current.items).toEqual(['enriched']);
        });
    });

    it('should pass searchQuery to observe', async () => {
        const observe = jest.fn().mockReturnValue(of([]));
        renderHook(() => usePaginatedObservable({
            pageSize: 10,
            observe,
            searchQuery: 'test-query'
        }));

        await waitFor(() => {
            expect(observe).toHaveBeenCalledWith(10, undefined, 'test-query');
        });
    });
});
