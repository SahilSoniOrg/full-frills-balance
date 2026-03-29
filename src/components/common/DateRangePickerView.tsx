import { AppButton } from '@/src/components/core';
import { Layout, Shape, Spacing } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { PeriodFilter } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { DateRangeCalendarStep } from './DateRangeCalendarStep';
import { DateRangeMenuContent } from './DateRangeMenuContent';

export type PickerView = 'MENU' | 'START_DATE' | 'END_DATE';

export interface DateRangePickerViewProps {
    visible: boolean;
    onClose: () => void;
    theme: Theme;
    insets: EdgeInsets;
    view: PickerView;
    setView: (view: PickerView) => void;
    draftFilter: PeriodFilter;
    customRange: { startDate: dayjs.Dayjs | null; endDate: dayjs.Dayjs | null };
    lastNValue: string;
    lastNUnit: 'days' | 'weeks' | 'months';
    monthList: { month: number; year: number; label: string }[];
    flatListRef: React.RefObject<FlatList | null>;
    handleSelectMonth: (month: number, year: number) => void;
    handleSelectAllTime: () => void;
    updateLastN: (value: string, unit: 'days' | 'weeks' | 'months') => void;
    handleDateSelect: (date: dayjs.Dayjs) => void;
    handleApply: () => void;
    INITIAL_MONTH_INDEX: number;
}

export function DateRangePickerView({
    visible,
    onClose,
    theme,
    insets,
    view,
    setView,
    draftFilter,
    customRange,
    lastNValue,
    lastNUnit,
    monthList,
    flatListRef,
    handleSelectMonth,
    handleSelectAllTime,
    updateLastN,
    handleDateSelect,
    handleApply,
    INITIAL_MONTH_INDEX,
}: DateRangePickerViewProps) {
    const { fonts } = useTheme();

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
                    style={[styles.content, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.md }]}
                    onPress={(event) => event.stopPropagation()}
                >
                    {view === 'MENU' ? (
                        <View style={styles.dragHandleContainer}>
                            <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
                        </View>
                    ) : null}

                    <View style={{ flex: 1 }}>
                        {view === 'MENU' ? (
                            <DateRangeMenuContent
                                theme={theme}
                                fonts={fonts}
                                draftFilter={draftFilter}
                                customRange={customRange}
                                lastNValue={lastNValue}
                                lastNUnit={lastNUnit}
                                monthList={monthList}
                                flatListRef={flatListRef}
                                initialMonthIndex={INITIAL_MONTH_INDEX}
                                onSelectMonth={handleSelectMonth}
                                onSelectAllTime={handleSelectAllTime}
                                onShowStartDate={() => setView('START_DATE')}
                                onShowEndDate={() => setView('END_DATE')}
                                onUpdateLastN={updateLastN}
                            />
                        ) : (
                            <DateRangeCalendarStep
                                mode={view}
                                date={view === 'START_DATE' ? customRange.startDate : customRange.endDate}
                                onBack={() => setView('MENU')}
                                onSelect={handleDateSelect}
                            />
                        )}
                    </View>

                    {view === 'MENU' ? (
                        <View style={[styles.footer, { borderTopColor: theme.border }]}>
                            <AppButton onPress={handleApply} variant="primary">
                                Set
                            </AppButton>
                        </View>
                    ) : null}
                </Pressable>
            </Pressable>
        </Modal>
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
        height: Layout.modal.defaultHeight,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingBottom: Spacing.lg,
    },
    dragHandle: {
        width: Layout.modal.dragHandle.width,
        height: Layout.modal.dragHandle.height,
        borderRadius: Layout.modal.dragHandle.borderRadius,
    },
    footer: {
        paddingTop: Spacing.md,
        borderTopWidth: 1,
    },
});
