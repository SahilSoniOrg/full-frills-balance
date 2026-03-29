import { AppButton, AppText } from '@/src/components/core';
import { Section } from '@/src/components/layout';
import { Layout, Shape, Size, Spacing, Typography } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { Separator } from '@/src/design-system';
import { PeriodFilter } from '@/src/utils/dateUtils';
import React from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface DateRangeMenuContentProps {
    theme: Theme;
    fonts: any;
    draftFilter: PeriodFilter;
    customRange: { startDate: any; endDate: any };
    lastNValue: string;
    lastNUnit: 'days' | 'weeks' | 'months';
    monthList: { month: number; year: number; label: string }[];
    flatListRef: React.RefObject<FlatList | null>;
    initialMonthIndex: number;
    onSelectMonth: (month: number, year: number) => void;
    onSelectAllTime: () => void;
    onShowStartDate: () => void;
    onShowEndDate: () => void;
    onUpdateLastN: (value: string, unit: 'days' | 'weeks' | 'months') => void;
}

export function DateRangeMenuContent({
    theme,
    fonts,
    draftFilter,
    customRange,
    lastNValue,
    lastNUnit,
    monthList,
    flatListRef,
    initialMonthIndex,
    onSelectMonth,
    onSelectAllTime,
    onShowStartDate,
    onShowEndDate,
    onUpdateLastN,
}: DateRangeMenuContentProps) {
    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Section title="Choose month">
                <FlatList
                    ref={flatListRef}
                    horizontal
                    data={monthList}
                    keyExtractor={(item) => `${item.year}-${item.month}`}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalScroll}
                    initialScrollIndex={initialMonthIndex}
                    getItemLayout={(_, index) => ({
                        length: Layout.datePicker.monthSlider.itemWidth,
                        offset: Layout.datePicker.monthSlider.itemWidth * index,
                        index,
                    })}
                    renderItem={({ item }) => {
                        const isActive =
                            draftFilter.type === 'MONTH' &&
                            draftFilter.month === item.month &&
                            draftFilter.year === item.year;

                        return (
                            <TouchableOpacity
                                style={[
                                    styles.chip,
                                    { backgroundColor: isActive ? theme.primary : theme.surface },
                                ]}
                                onPress={() => onSelectMonth(item.month, item.year)}
                            >
                                <AppText
                                    variant="body"
                                    style={{
                                        color: isActive ? theme.onPrimary : theme.text,
                                        fontFamily: fonts.medium,
                                    }}
                                >
                                    {item.label}
                                </AppText>
                            </TouchableOpacity>
                        );
                    }}
                />
            </Section>

            <Separator style={styles.divider} />

            <Section title="or custom range">
                <View style={styles.customRangeRow}>
                    <TouchableOpacity
                        style={[
                            styles.inputButton,
                            {
                                borderColor: draftFilter.type === 'CUSTOM' ? theme.primary : theme.border,
                                backgroundColor: theme.surface,
                            },
                        ]}
                        onPress={onShowStartDate}
                    >
                        <AppText variant="caption" color="secondary">
                            From
                        </AppText>
                        <AppText variant="body" style={{ fontFamily: fonts.bold }}>
                            {customRange.startDate ? customRange.startDate.format('DD MMM YYYY') : 'Start'}
                        </AppText>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.inputButton,
                            {
                                borderColor: draftFilter.type === 'CUSTOM' ? theme.primary : theme.border,
                                backgroundColor: theme.surface,
                            },
                        ]}
                        onPress={onShowEndDate}
                    >
                        <AppText variant="caption" color="secondary">
                            To
                        </AppText>
                        <AppText variant="body" style={{ fontFamily: fonts.bold }}>
                            {customRange.endDate ? customRange.endDate.format('DD MMM YYYY') : 'Now'}
                        </AppText>
                    </TouchableOpacity>
                </View>
            </Section>

            <Section title="or in the last">
                <View style={styles.lastNRow}>
                    <View
                        style={[
                            styles.numberInputContainer,
                            {
                                backgroundColor: theme.surface,
                                borderColor: draftFilter.type === 'LAST_N' ? theme.primary : 'transparent',
                                borderWidth: 1,
                            },
                        ]}
                    >
                        <TextInput
                            style={[styles.numberInput, { color: theme.text, fontFamily: fonts.bold }]}
                            value={lastNValue}
                            onChangeText={(text) => onUpdateLastN(text, lastNUnit)}
                            keyboardType="number-pad"
                            maxLength={3}
                            onFocus={() => onUpdateLastN(lastNValue, lastNUnit)}
                        />
                    </View>

                    <View style={[styles.unitSelector, { backgroundColor: theme.surface }]}>
                        {(['days', 'weeks', 'months'] as const).map((unit) => (
                            <TouchableOpacity
                                key={unit}
                                style={[styles.unitOption, lastNUnit === unit && { backgroundColor: theme.primary }]}
                                onPress={() => onUpdateLastN(lastNValue, unit)}
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

            <Section title="or all time">
                <AppButton
                    variant={draftFilter.type === 'ALL_TIME' ? 'primary' : 'outline'}
                    onPress={onSelectAllTime}
                    style={styles.allTimeBtn}
                >
                    Select All Time
                </AppButton>
            </Section>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingBottom: Spacing.xxxxl,
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
        width: Size.buttonXl,
        height: Size.inputMd,
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
        height: Size.inputMd,
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
});
