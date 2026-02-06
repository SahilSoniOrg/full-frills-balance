import { UIConstants } from '@/src/constants';
import { DateRange, getLastNRange, getMonthRange, PeriodFilter } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList } from 'react-native';

interface UseDateRangePickerProps {
    visible: boolean;
    currentFilter: PeriodFilter;
    onSelect: (range: DateRange | null, filter: PeriodFilter) => void;
    onClose: () => void;
}

export type PickerView = 'MENU' | 'START_DATE' | 'END_DATE';

export function useDateRangePicker({ visible, currentFilter, onSelect, onClose }: UseDateRangePickerProps) {
    const [view, setView] = useState<PickerView>('MENU');
    const [draftFilter, setDraftFilter] = useState<PeriodFilter>(currentFilter);
    const [customRange, setCustomRange] = useState<{ startDate: dayjs.Dayjs | null, endDate: dayjs.Dayjs | null }>({
        startDate: null,
        endDate: null
    });
    const [lastNValue, setLastNValue] = useState('7');
    const [lastNUnit, setLastNUnit] = useState<'days' | 'weeks' | 'months'>('days');

    const flatListRef = useRef<FlatList>(null);
    const INITIAL_MONTH_INDEX = UIConstants.datePicker.monthSlider.initialIndex;

    const monthList = useMemo(() => {
        const list = [];
        const today = dayjs();
        for (let i = INITIAL_MONTH_INDEX; i > 0; i--) {
            const d = today.subtract(i, 'month');
            list.push({ month: d.month(), year: d.year(), label: d.format('MMM YYYY') });
        }
        list.push({ month: today.month(), year: today.year(), label: today.format('MMM YYYY') });
        for (let i = 1; i <= 13; i++) {
            const d = today.add(i, 'month');
            list.push({ month: d.month(), year: d.year(), label: d.format('MMM YYYY') });
        }
        return list;
    }, []);

    useEffect(() => {
        if (visible) {
            setDraftFilter(currentFilter);
            setView('MENU');

            if (currentFilter.type === 'CUSTOM' && currentFilter.startDate && currentFilter.endDate) {
                setCustomRange({
                    startDate: dayjs(currentFilter.startDate),
                    endDate: dayjs(currentFilter.endDate)
                });
            } else {
                setCustomRange({ startDate: null, endDate: null });
            }

            if (currentFilter.type === 'LAST_N') {
                setLastNValue((currentFilter.lastN ?? 7).toString());
                setLastNUnit(currentFilter.lastNUnit ?? 'days');
            } else {
                setLastNValue('7');
                setLastNUnit('days');
            }

            // Scroll to current/selected month
            setTimeout(() => {
                let targetIndex: number = INITIAL_MONTH_INDEX;
                if (currentFilter.type === 'MONTH') {
                    const foundIndex = monthList.findIndex(
                        m => m.month === currentFilter.month && m.year === currentFilter.year
                    );
                    if (foundIndex !== -1) targetIndex = foundIndex;
                }
                flatListRef.current?.scrollToIndex({ index: targetIndex, animated: false, viewPosition: 0.5 });
            }, UIConstants.animation.scrollDelay);
        }
    }, [visible, currentFilter, monthList]);

    const handleSelectMonth = useCallback((month: number, year: number) => {
        setDraftFilter({ type: 'MONTH', month, year });
    }, []);

    const handleSelectAllTime = useCallback(() => {
        setDraftFilter({ type: 'ALL_TIME' });
    }, []);

    const updateLastN = useCallback((nStr: string, unit: 'days' | 'weeks' | 'months') => {
        setLastNValue(nStr);
        setLastNUnit(unit);
        const n = parseInt(nStr);
        if (!isNaN(n) && n > 0) {
            setDraftFilter({ type: 'LAST_N', lastN: n, lastNUnit: unit });
        }
    }, []);

    const handleDateSelect = useCallback((params: { date: any }) => {
        const date = dayjs(params.date);
        let newRange = { ...customRange };

        if (view === 'START_DATE') {
            newRange.startDate = date;
        } else {
            newRange.endDate = date;
        }

        setCustomRange(newRange);

        if (newRange.startDate || newRange.endDate) {
            setDraftFilter({
                type: 'CUSTOM',
                startDate: newRange.startDate ? newRange.startDate.valueOf() : 0,
                endDate: newRange.endDate ? newRange.endDate.valueOf() : 0
            });
        }

        setView('MENU');
    }, [customRange, view]);

    const handleApply = useCallback(() => {
        let range: DateRange | null = null;

        if (draftFilter.type === 'MONTH' && draftFilter.month !== undefined && draftFilter.year !== undefined) {
            const mRange = getMonthRange(draftFilter.month, draftFilter.year);
            range = { ...mRange, label: `${dayjs().month(draftFilter.month).format('MMM')} ${draftFilter.year}` };
        } else if (draftFilter.type === 'LAST_N' && draftFilter.lastN && draftFilter.lastNUnit) {
            range = getLastNRange(draftFilter.lastN, draftFilter.lastNUnit);
            range.label = `Last ${draftFilter.lastN} ${draftFilter.lastNUnit}`;
        } else if (draftFilter.type === 'CUSTOM') {
            const start = customRange.startDate ? customRange.startDate.startOf('day') : dayjs(0);
            const end = customRange.endDate ? customRange.endDate.endOf('day') : dayjs().endOf('day');

            range = {
                startDate: start.valueOf(),
                endDate: end.valueOf(),
                label: `${start.year() === 1970 ? 'Start' : start.format('MMM D')} - ${customRange.endDate ? end.format('MMM D') : 'Now'}`
            };
        }

        onSelect(range, draftFilter);
        onClose();
    }, [draftFilter, customRange, onSelect, onClose]);

    return {
        view,
        setView,
        draftFilter,
        customRange,
        lastNValue,
        lastNUnit,
        monthList,
        flatListRef,
        INITIAL_MONTH_INDEX,
        handleSelectMonth,
        handleSelectAllTime,
        updateLastN,
        handleDateSelect,
        handleApply,
    };
}
