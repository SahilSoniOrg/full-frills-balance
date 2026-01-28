import { AppButton, AppText, Divider, IconButton } from '@/src/components/core';
import { getDatePickerStyles, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { DateRange, getLastNRange, getMonthRange, PeriodFilter } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from 'react-native-ui-datepicker';

interface DateRangePickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (range: DateRange | null, filter: PeriodFilter) => void;
    currentFilter: PeriodFilter;
}

type PickerView = 'MENU' | 'START_DATE' | 'END_DATE';

export function DateRangePicker({ visible, onClose, onSelect, currentFilter }: DateRangePickerProps) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    // View State
    const [view, setView] = useState<PickerView>('MENU');
    const [draftFilter, setDraftFilter] = useState<PeriodFilter>(currentFilter);

    // Sync draft with current when opening
    useEffect(() => {
        if (visible) {
            setDraftFilter(currentFilter);

            // Sync local inputs based on filter type
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
        }
    }, [visible, currentFilter]);

    // Data State
    const [customRange, setCustomRange] = useState<{ startDate: dayjs.Dayjs | null, endDate: dayjs.Dayjs | null }>({
        startDate: null,
        endDate: null
    });

    const [lastNValue, setLastNValue] = useState('7');
    const [lastNUnit, setLastNUnit] = useState<'days' | 'weeks' | 'months'>('days');

    // Constants
    // Generate chronological months: Past 25 ... Current ... Future 13
    const monthList = React.useMemo(() => {
        const list = [];
        const today = dayjs();

        // Past 25 months
        for (let i = 25; i > 0; i--) {
            const d = today.subtract(i, 'month');
            list.push({ month: d.month(), year: d.year(), label: d.format('MMM YYYY') });
        }

        // Current month
        list.push({ month: today.month(), year: today.year(), label: today.format('MMM YYYY') });

        // Future 13 months
        for (let i = 1; i <= 13; i++) {
            const d = today.add(i, 'month');
            list.push({ month: d.month(), year: d.year(), label: d.format('MMM YYYY') });
        }
        return list;
    }, []);

    const INITIAL_MONTH_INDEX = 25; // The current month is at index 25
    const flatListRef = React.useRef<FlatList>(null);

    // Scroll to current month (index 25) or selected month when opening
    useEffect(() => {
        if (visible && flatListRef.current) {
            let targetIndex = INITIAL_MONTH_INDEX;

            if (currentFilter.type === 'MONTH') {
                const foundIndex = monthList.findIndex(
                    m => m.month === currentFilter.month && m.year === currentFilter.year
                );
                if (foundIndex !== -1) {
                    targetIndex = foundIndex;
                }
            }

            // Small timeout to ensure layout is ready
            setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: targetIndex, animated: false, viewPosition: 0.5 });
            }, 100);
        }
    }, [visible, currentFilter, monthList]);

    // Handlers
    const handleSelectMonth = (month: number, year: number) => {
        setDraftFilter({ type: 'MONTH', month, year });
        // Optional: Scroll to that month on select?
        // Let's keep it centered on Open.
    };

    const handleSelectAllTime = () => {
        setDraftFilter({ type: 'ALL_TIME' });
    };

    // Called when Last N inputs change
    const updateLastN = (nStr: string, unit: 'days' | 'weeks' | 'months') => {
        setLastNValue(nStr);
        setLastNUnit(unit);

        const n = parseInt(nStr);
        if (!isNaN(n) && n > 0) {
            setDraftFilter({ type: 'LAST_N', lastN: n, lastNUnit: unit });
        }
    };

    const handleDateSelect = (params: { date: any }) => {
        const date = dayjs(params.date);
        let newRange = { ...customRange };

        if (view === 'START_DATE') {
            newRange.startDate = date;
        } else {
            newRange.endDate = date;
        }

        setCustomRange(newRange);

        // Allow partial selection in draft
        if (newRange.startDate || newRange.endDate) {
            setDraftFilter({
                type: 'CUSTOM',
                startDate: newRange.startDate ? newRange.startDate.valueOf() : 0,
                endDate: newRange.endDate ? newRange.endDate.valueOf() : 0 // temporary placeholder
            });
        }

        setView('MENU');
    };

    const handleApply = () => {
        let range: DateRange | null = null;

        if (draftFilter.type === 'MONTH' && draftFilter.month !== undefined && draftFilter.year !== undefined) {
            const mRange = getMonthRange(draftFilter.month, draftFilter.year);
            range = { ...mRange, label: `${dayjs().month(draftFilter.month).format('MMM')} ${draftFilter.year}` };
        } else if (draftFilter.type === 'LAST_N' && draftFilter.lastN && draftFilter.lastNUnit) {
            range = getLastNRange(draftFilter.lastN, draftFilter.lastNUnit);
            range.label = `Last ${draftFilter.lastN} ${draftFilter.lastNUnit}`;
        } else if (draftFilter.type === 'CUSTOM') {
            // Handle custom range logic with defaults
            const start = customRange.startDate ? customRange.startDate.startOf('day') : dayjs(0); // Epoch if missing start
            const end = customRange.endDate ? customRange.endDate.endOf('day') : dayjs().endOf('day'); // End of today if missing end

            // If both missing (shouldn't happen if type is CUSTOM but safe check), default to Today
            if (!customRange.startDate && !customRange.endDate) {
                // Fallback to all time or today? 
                // If user clicked custom but selected nothing, maybe just return null or All Time.
                // But let's assume they want "All Time" effectively if nothing selected?
                // Or stick to current defaults.
            }

            range = {
                startDate: start.valueOf(),
                endDate: end.valueOf(),
                label: `${start.year() === 1970 ? 'Start' : start.format('MMM D')} - ${customRange.endDate ? end.format('MMM D') : 'Now'}`
            };
        }
        // ALL_TIME remains null range

        onSelect(range, draftFilter);
        onClose();
    };

    // Renders
    const renderDatePicker = () => (
        <View style={{ flex: 1 }}>
            <View style={styles.pickerHeader}>
                <IconButton name="arrow-back" onPress={() => setView('MENU')} />
                <AppText variant="subheading">
                    Select {view === 'START_DATE' ? 'Start' : 'End'} Date
                </AppText>
                <View style={{ width: Size.md }} />
            </View>
            <DateTimePicker
                mode="single"
                date={view === 'START_DATE' ? (customRange.startDate || dayjs()) : (customRange.endDate || dayjs())}
                onChange={handleDateSelect}
                styles={getDatePickerStyles(theme)}
            />
        </View>
    );

    const renderMenu = () => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xxxxl }}>
            {/* 1. CHOOSE MONTH */}
            <Section title="Choose month">
                <FlatList
                    ref={flatListRef}
                    horizontal
                    data={monthList}
                    keyExtractor={(item) => `${item.year}-${item.month}`}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalScroll}
                    initialScrollIndex={INITIAL_MONTH_INDEX}
                    getItemLayout={(_, index) => (
                        { length: 120, offset: 120 * index, index }
                    )}
                    renderItem={({ item }: { item: { month: number; year: number; label: string } }) => {
                        const isActive = draftFilter.type === 'MONTH' && draftFilter.month === item.month && draftFilter.year === item.year;
                        return (
                            <RangeChip
                                label={item.label}
                                active={isActive}
                                onPress={() => handleSelectMonth(item.month, item.year)}
                            />
                        );
                    }}
                />
            </Section>

            <Divider style={styles.divider} />

            {/* 2. CUSTOM RANGE */}
            <Section title="or custom range">
                <View style={styles.customRangeRow}>
                    <TouchableOpacity
                        style={[
                            styles.inputButton,
                            { borderColor: draftFilter.type === 'CUSTOM' ? theme.primary : theme.border, backgroundColor: theme.surface }
                        ]}
                        onPress={() => setView('START_DATE')}
                    >
                        <AppText variant="caption" color="secondary">From</AppText>
                        <AppText variant="body" style={styles.inputText}>
                            {customRange.startDate ? customRange.startDate.format('DD MMM YYYY') : 'Start'}
                        </AppText>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.inputButton,
                            { borderColor: draftFilter.type === 'CUSTOM' ? theme.primary : theme.border, backgroundColor: theme.surface }
                        ]}
                        onPress={() => setView('END_DATE')}
                    >
                        <AppText variant="caption" color="secondary">To</AppText>
                        <AppText variant="body" style={styles.inputText}>
                            {customRange.endDate ? customRange.endDate.format('DD MMM YYYY') : 'Now'}
                        </AppText>
                    </TouchableOpacity>
                </View>
            </Section>

            {/* 3. LAST N */}
            <Section title="or in the last">
                <View style={styles.lastNRow}>
                    <View style={[
                        styles.numberInputContainer,
                        { backgroundColor: theme.surface, borderColor: draftFilter.type === 'LAST_N' ? theme.primary : 'transparent', borderWidth: 1 }
                    ]}>
                        <TextInput
                            style={[styles.numberInput, { color: theme.text, fontFamily: Typography.fonts.bold }]}
                            value={lastNValue}
                            onChangeText={(text) => updateLastN(text, lastNUnit)}
                            keyboardType="number-pad"
                            maxLength={3}
                            onFocus={() => updateLastN(lastNValue, lastNUnit)}
                        />
                    </View>

                    <View style={[styles.unitSelector, { backgroundColor: theme.surface }]}>
                        {(['days', 'weeks', 'months'] as const).map((unit) => (
                            <TouchableOpacity
                                key={unit}
                                style={[
                                    styles.unitOption,
                                    lastNUnit === unit && { backgroundColor: theme.primary }
                                ]}
                                onPress={() => updateLastN(lastNValue, unit)}
                            >
                                <AppText
                                    variant="caption"
                                    style={{ color: lastNUnit === unit ? theme.onPrimary : theme.textSecondary }}
                                >
                                    {unit.charAt(0).toUpperCase() + unit.slice(1)}
                                </AppText>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Section>

            {/* 4. ALL TIME */}
            <Section title="or all time">
                <AppButton
                    variant={draftFilter.type === 'ALL_TIME' ? 'primary' : 'outline'}
                    onPress={handleSelectAllTime}
                    style={styles.allTimeBtn}
                >
                    Select All Time
                </AppButton>
            </Section>
        </ScrollView>
    );

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={() => {
                if (view !== 'MENU') setView('MENU');
                else onClose();
            }}
        >
            <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
                <Pressable
                    style={[
                        styles.content,
                        { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.md }
                    ]}
                    onPress={e => e.stopPropagation()}
                >
                    {view === 'MENU' && (
                        <View style={styles.dragHandleContainer}>
                            <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
                        </View>
                    )}

                    <View style={{ flex: 1 }}>
                        {view === 'MENU' ? renderMenu() : renderDatePicker()}
                    </View>

                    {view === 'MENU' && (
                        <View style={[styles.footer, { borderTopColor: theme.border }]}>
                            <AppButton onPress={handleApply} variant="primary">
                                Set
                            </AppButton>
                        </View>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <AppText variant="heading" style={styles.sectionTitle}>{title}</AppText>
            {children}
        </View>
    );
}

function RangeChip({ label, active, onPress }: { label: string, active: boolean, onPress: () => void }) {
    const { theme } = useTheme();
    return (
        <TouchableOpacity
            style={[
                styles.chip,
                { backgroundColor: active ? theme.primary : theme.surface }
            ]}
            onPress={onPress}
        >
            <AppText
                variant="body"
                style={[
                    styles.chipText,
                    { color: active ? theme.onPrimary : theme.text }
                ]}
            >
                {label}
            </AppText>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    content: {
        borderTopLeftRadius: Shape.radius.r2,
        borderTopRightRadius: Shape.radius.r2,
        height: '85%',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingBottom: Spacing.lg,
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
    },
    pickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    section: {
        marginBottom: Spacing.xl,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
        fontSize: Typography.sizes.lg,
    },
    horizontalScroll: {
        gap: Spacing.sm,
        paddingRight: Spacing.lg,
    },
    chip: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderRadius: Shape.radius.full,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    chipText: {
        fontFamily: Typography.fonts.medium,
    },
    divider: {
        marginBottom: Spacing.xl,
    },
    customRangeRow: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    inputButton: {
        flex: 1,
        borderWidth: 1,
        borderRadius: Shape.radius.md,
        padding: Spacing.md,
        gap: Spacing.xs,
    },
    inputText: {
        fontFamily: Typography.fonts.bold,
    },
    lastNRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    numberInputContainer: {
        width: 60,
        height: 48,
        borderRadius: Shape.radius.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    numberInput: {
        fontSize: Typography.sizes.xl,
        textAlign: 'center',
        width: '100%',
    },
    unitSelector: {
        flex: 1,
        flexDirection: 'row',
        height: 48,
        borderRadius: Shape.radius.md,
        padding: 4,
    },
    unitOption: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: Shape.radius.sm,
    },
    goButton: {
        width: 48,
        height: 48,
        borderRadius: Shape.radius.full,
        justifyContent: 'center',
        alignItems: 'center',
    },
    allTimeBtn: {
        width: '100%',
    },
    footer: {
        paddingTop: Spacing.md,
        borderTopWidth: 1,
    }
});
