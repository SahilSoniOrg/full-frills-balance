import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { act, renderHook } from '@testing-library/react-native';

describe('useDateRangeFilter', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-02-15T12:00:00Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should initialize with current month by default', () => {
        const { result } = renderHook(() => useDateRangeFilter());

        // Feb 2024 (Leap Year)
        // Start: 2024-02-01 00:00:00.000
        // End: 2024-02-29 23:59:59.999
        const expectedStart = new Date(2024, 1, 1, 0, 0, 0, 0).getTime();
        const expectedEnd = new Date(2024, 1, 29, 23, 59, 59, 999).getTime();

        expect(result.current.periodFilter).toEqual({ type: 'MONTH', month: 1, year: 2024 });
        expect(result.current.dateRange).toEqual({
            startDate: expectedStart,
            endDate: expectedEnd,
            label: 'Feb 2024'
        });
    });

    it('should initialize with all time if requested', () => {
        const { result } = renderHook(() => useDateRangeFilter({ defaultToCurrentMonth: false }));

        expect(result.current.periodFilter).toEqual({ type: 'ALL_TIME' });
        expect(result.current.dateRange).toBeNull();
    });

    it('should toggle picker visibility', () => {
        const { result } = renderHook(() => useDateRangeFilter());

        expect(result.current.isPickerVisible).toBe(false);

        act(() => {
            result.current.showPicker();
        });
        expect(result.current.isPickerVisible).toBe(true);

        act(() => {
            result.current.hidePicker();
        });
        expect(result.current.isPickerVisible).toBe(false);
    });

    it('should set filter manually', () => {
        const { result } = renderHook(() => useDateRangeFilter());
        const newRange = { startDate: 1000, endDate: 2000 };
        const newFilter = { type: 'CUSTOM' } as any;

        act(() => {
            result.current.setFilter(newRange, newFilter);
        });

        expect(result.current.dateRange).toEqual(newRange);
        expect(result.current.periodFilter).toEqual(newFilter);
    });

    it('should navigate months', () => {
        const { result } = renderHook(() => useDateRangeFilter());

        // Start Feb 2024
        expect(result.current.periodFilter.month).toBe(1);

        act(() => {
            result.current.navigatePrevious?.();
        });

        // Jan 2024
        expect(result.current.periodFilter.month).toBe(0);

        const janStart = new Date(2024, 0, 1, 0, 0, 0, 0).getTime();
        expect(result.current.dateRange?.startDate).toBe(janStart);

        act(() => {
            result.current.navigateNext?.();
        });

        // Back to Feb 2024
        expect(result.current.periodFilter.month).toBe(1);
    });

    it('should disable navigation if not monthly filter', () => {
        const { result } = renderHook(() => useDateRangeFilter({ defaultToCurrentMonth: false }));

        expect(result.current.periodFilter.type).toBe('ALL_TIME');
        expect(result.current.navigatePrevious).toBeUndefined();
        expect(result.current.navigateNext).toBeUndefined();
    });
});
