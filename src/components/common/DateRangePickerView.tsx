import { CustomDateTimePicker } from '@/src/components/common/CustomDateTimePicker';
import { AppButton, AppText, Divider, IconButton } from '@/src/components/core';
import { Layout, Shape, Size, Spacing, Typography } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { PeriodFilter } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import React from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';

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
    monthList: any[];
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
    const renderDatePicker = () => (
        <View style={{ flex: 1 }}>
            <View style={styles.pickerHeader}>
                <IconButton name="back" onPress={() => setView('MENU')} />
                <AppText variant="subheading">
                    Select {view === 'START_DATE' ? 'Start' : 'End'} Date
                </AppText>
                <View style={{ width: Size.md }} />
            </View>
            <CustomDateTimePicker
                date={view === 'START_DATE' ? (customRange.startDate || dayjs()) : (customRange.endDate || dayjs())}
                onChange={handleDateSelect}
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
                        { length: Layout.datePicker.monthSlider.itemWidth, offset: Layout.datePicker.monthSlider.itemWidth * index, index }
                    )}
                    renderItem={({ item }: { item: { month: number; year: number; label: string } }) => {
                        const isActive = draftFilter.type === 'MONTH' && draftFilter.month === item.month && draftFilter.year === item.year;
                        return (
                            <RangeChip
                                label={item.label}
                                active={isActive}
                                theme={theme}
                                fonts={fonts}
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
                        <AppText variant="body" style={[{ fontFamily: fonts.bold }]}>
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
                        <AppText variant="body" style={[{ fontFamily: fonts.bold }]}>
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
                            style={[styles.numberInput, { color: theme.text, fontFamily: fonts.bold }]}
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

function RangeChip({ label, active, theme, fonts, onPress }: { label: string, active: boolean, theme: Theme, fonts: any, onPress: () => void }) {
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
                    { color: active ? theme.onPrimary : theme.text, fontFamily: fonts.medium }
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
        padding: Spacing.xs,
    },
    unitOption: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: Shape.radius.sm,
    },
    allTimeBtn: {
        width: '100%',
    },
    footer: {
        paddingTop: Spacing.md,
        borderTopWidth: 1,
    }
});
