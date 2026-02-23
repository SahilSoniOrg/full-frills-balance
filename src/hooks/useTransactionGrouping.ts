import { TransactionListItem } from '@/src/types/ui';
import { useCallback, useMemo, useState } from 'react';

export interface GroupingOptions<T> {
    items: T[];
    getDate: (item: T) => number;
    getStats: (items: T[]) => { count: number; netAmount: number; currencyCode: string };
    renderItem: (item: T) => TransactionListItem;
    sortByDate?: 'asc' | 'desc';
}

export function useTransactionGrouping<T>({
    items,
    getDate,
    getStats,
    renderItem,
    sortByDate = 'desc',
}: GroupingOptions<T>) {
    const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());

    const toggleDay = useCallback((timestamp: number) => {
        setCollapsedDays(prev => {
            const next = new Set(prev);
            if (next.has(timestamp)) {
                next.delete(timestamp);
            } else {
                next.add(timestamp);
            }
            return next;
        });
    }, []);

    const groupedItems = useMemo(() => {
        const result: TransactionListItem[] = [];
        const dayGroups: Record<number, T[]> = {};
        const days: number[] = [];

        items.forEach((item) => {
            const dateValue = getDate(item);
            const startOfDay = new Date(dateValue).setHours(0, 0, 0, 0);
            if (!dayGroups[startOfDay]) {
                dayGroups[startOfDay] = [];
                days.push(startOfDay);
            }
            dayGroups[startOfDay].push(item);
        });

        // Sort days
        days.sort((a, b) => sortByDate === 'desc' ? b - a : a - b);

        days.forEach(startOfDay => {
            const itemsForDay = dayGroups[startOfDay];
            const isCollapsed = collapsedDays.has(startOfDay);
            const stats = getStats(itemsForDay);

            result.push({
                id: `sep-${startOfDay}`,
                type: 'separator',
                date: startOfDay,
                isCollapsed,
                onToggle: () => toggleDay(startOfDay),
                count: stats.count,
                netAmount: stats.netAmount,
                currencyCode: stats.currencyCode,
            });

            if (isCollapsed) return;

            itemsForDay.forEach(item => {
                result.push(renderItem(item));
            });
        });

        return result;
    }, [items, getDate, getStats, renderItem, sortByDate, collapsedDays, toggleDay]);

    return {
        groupedItems,
        collapsedDays,
        toggleDay,
    };
}
