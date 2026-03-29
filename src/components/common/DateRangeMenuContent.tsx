import { AppButton, AppIcon, AppSegmentedControl, AppText } from '@/src/components/core';
import { Layout, Shape, Spacing, Typography, withOpacity } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
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
    const monthPanelActive = draftFilter.type === 'MONTH';
    const customPanelActive = draftFilter.type === 'CUSTOM';
    const rollingPanelActive = draftFilter.type === 'LAST_N';
    const allTimeActive = draftFilter.type === 'ALL_TIME';
    const selectedMonthLabel =
        draftFilter.type === 'MONTH'
            ? monthList.find((item) => item.month === draftFilter.month && item.year === draftFilter.year)?.label
            : null;
    const customSummary =
        customRange.startDate || customRange.endDate
            ? `${customRange.startDate ? customRange.startDate.format('DD MMM YYYY') : 'Start'} - ${customRange.endDate ? customRange.endDate.format('DD MMM YYYY') : 'Now'
            }`
            : null;
    const rollingSummary =
        lastNValue.trim().length > 0
            ? `Using last ${lastNValue.trim()} ${lastNUnit}`
            : 'Enter a range length';

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View
                style={[
                    styles.section,
                    monthPanelActive && styles.sectionActive,
                    monthPanelActive && { backgroundColor: withOpacity(theme.primary, 0.07), borderColor: withOpacity(theme.primary, 0.18) },
                ]}
            >
                <View style={styles.panelHeader}>
                    <View
                        style={[
                            styles.panelIcon,
                            { backgroundColor: withOpacity(theme.primary, monthPanelActive ? 0.18 : 0.1) },
                        ]}
                    >
                        <AppIcon name="calendar" size={16} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={styles.panelTitleRow}>
                            <AppText
                                variant="body"
                                weight="semibold"
                                style={{ fontFamily: fonts.semibold, color: monthPanelActive ? theme.primary : theme.text }}
                            >
                                Choose month
                            </AppText>
                            {monthPanelActive ? (
                                <View
                                    style={[
                                        styles.activeBadge,
                                        {
                                            backgroundColor: withOpacity(theme.primary, 0.14),
                                            borderColor: withOpacity(theme.primary, 0.2),
                                        },
                                    ]}
                                >
                                    <AppText variant="caption" style={{ color: theme.primary, fontFamily: fonts.semibold }}>
                                        Selected
                                    </AppText>
                                </View>
                            ) : null}
                        </View>
                        <AppText
                            variant="caption"
                            style={{
                                color: monthPanelActive ? withOpacity(theme.primary, 0.92) : theme.textSecondary,
                                fontFamily: monthPanelActive ? fonts.medium : fonts.regular,
                            }}
                        >
                            {monthPanelActive && selectedMonthLabel
                                ? selectedMonthLabel
                                : 'Quick monthly snapshots for reports and trends.'}
                        </AppText>
                    </View>
                </View>
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
                                    {
                                        backgroundColor: isActive ? theme.primary : withOpacity(theme.surfaceSecondary, 0.38),
                                        borderColor: isActive ? theme.primary : 'transparent',
                                    },
                                ]}
                                onPress={() => onSelectMonth(item.month, item.year)}
                            >
                                <AppText
                                    variant="body"
                                    style={{
                                        color: isActive ? theme.onPrimary : theme.text,
                                        fontFamily: isActive ? fonts.semibold : fonts.medium,
                                    }}
                                >
                                    {item.label}
                                </AppText>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>

            <View style={[styles.divider, { backgroundColor: withOpacity(theme.border, 0.7) }]} />

            <View
                style={[
                    styles.section,
                    customPanelActive && styles.sectionActive,
                    customPanelActive && { backgroundColor: withOpacity(theme.primary, 0.07), borderColor: withOpacity(theme.primary, 0.18) },
                ]}
            >
                <View style={styles.panelHeader}>
                    <View
                        style={[
                            styles.panelIcon,
                            { backgroundColor: withOpacity(customPanelActive ? theme.primary : theme.warning, customPanelActive ? 0.18 : 0.1) },
                        ]}
                    >
                        <AppIcon name="timeline" size={16} color={customPanelActive ? theme.primary : theme.warning} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={styles.panelTitleRow}>
                            <AppText
                                variant="body"
                                weight="semibold"
                                style={{ fontFamily: fonts.semibold, color: customPanelActive ? theme.primary : theme.text }}
                            >
                                Custom range
                            </AppText>
                            {customPanelActive ? (
                                <View
                                    style={[
                                        styles.activeBadge,
                                        {
                                            backgroundColor: withOpacity(theme.primary, 0.14),
                                            borderColor: withOpacity(theme.primary, 0.2),
                                        },
                                    ]}
                                >
                                    <AppText variant="caption" style={{ color: theme.primary, fontFamily: fonts.semibold }}>
                                        Selected
                                    </AppText>
                                </View>
                            ) : null}
                        </View>
                        <AppText
                            variant="caption"
                            style={{
                                color: customPanelActive ? withOpacity(theme.primary, 0.92) : theme.textSecondary,
                                fontFamily: customPanelActive ? fonts.medium : fonts.regular,
                            }}
                        >
                            {customPanelActive && customSummary ? customSummary : 'Pick exact start and end dates.'}
                        </AppText>
                    </View>
                </View>

                <View style={styles.customRangeRow}>
                    <TouchableOpacity
                        style={[
                            styles.inputButton,
                            {
                                borderColor: customPanelActive ? withOpacity(theme.primary, 0.34) : withOpacity(theme.border, 0.45),
                                backgroundColor: customPanelActive ? withOpacity(theme.primary, 0.05) : 'transparent',
                            },
                        ]}
                        onPress={onShowStartDate}
                    >
                        <AppText variant="caption" color="secondary">
                            From
                        </AppText>
                        <AppText variant="body" style={{ fontFamily: fonts.bold }}>
                            {customRange.startDate ? customRange.startDate.format('DD MMM YYYY') : 'Choose date'}
                        </AppText>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.inputButton,
                            {
                                borderColor: customPanelActive ? withOpacity(theme.primary, 0.34) : withOpacity(theme.border, 0.45),
                                backgroundColor: customPanelActive ? withOpacity(theme.primary, 0.05) : 'transparent',
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
            </View>

            <View style={[styles.divider, { backgroundColor: withOpacity(theme.border, 0.7) }]} />

            <View
                style={[
                    styles.section,
                    rollingPanelActive && styles.sectionActive,
                    rollingPanelActive && { backgroundColor: withOpacity(theme.primary, 0.07), borderColor: withOpacity(theme.primary, 0.18) },
                ]}
            >
                <View style={styles.panelHeader}>
                    <View
                        style={[
                            styles.panelIcon,
                            { backgroundColor: withOpacity(rollingPanelActive ? theme.primary : theme.success, rollingPanelActive ? 0.18 : 0.1) },
                        ]}
                    >
                        <AppIcon name="refresh" size={16} color={rollingPanelActive ? theme.primary : theme.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={styles.panelTitleRow}>
                            <AppText
                                variant="body"
                                weight="semibold"
                                style={{ fontFamily: fonts.semibold, color: rollingPanelActive ? theme.primary : theme.text }}
                            >
                                Rolling window
                            </AppText>
                            {rollingPanelActive ? (
                                <View
                                    style={[
                                        styles.activeBadge,
                                        {
                                            backgroundColor: withOpacity(theme.primary, 0.14),
                                            borderColor: withOpacity(theme.primary, 0.2),
                                        },
                                    ]}
                                >
                                    <AppText variant="caption" style={{ color: theme.primary, fontFamily: fonts.semibold }}>
                                        Selected
                                    </AppText>
                                </View>
                            ) : null}
                        </View>
                        <AppText
                            variant="caption"
                            style={{
                                color: rollingPanelActive ? withOpacity(theme.primary, 0.92) : theme.textSecondary,
                                fontFamily: rollingPanelActive ? fonts.medium : fonts.regular,
                            }}
                        >
                            {rollingPanelActive ? rollingSummary : 'Great for “last 7 days” or “last 3 months”.'}
                        </AppText>
                    </View>
                </View>

                <View style={styles.lastNRow}>
                    <View
                        style={[
                            styles.numberInputContainer,
                            {
                                backgroundColor: rollingPanelActive ? withOpacity(theme.primary, 0.05) : 'transparent',
                                borderColor: rollingPanelActive ? withOpacity(theme.primary, 0.34) : withOpacity(theme.border, 0.45),
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

                    <View style={styles.unitSelector}>
                        <AppSegmentedControl
                            options={[
                                { id: 'days', label: 'Days' },
                                { id: 'weeks', label: 'Weeks' },
                                { id: 'months', label: 'Months' },
                            ]}
                            value={lastNUnit}
                            onChange={(unit) => onUpdateLastN(lastNValue, unit as 'days' | 'weeks' | 'months')}
                            flex
                            size="md"
                            trackColor={
                                rollingPanelActive
                                    ? withOpacity(theme.primary, 0.12)
                                    : withOpacity(theme.surfaceSecondary, 0.58)
                            }
                            pillColor={withOpacity(theme.primary, rollingPanelActive ? 0.22 : 0.18)}
                            activeTextColor={theme.primary}
                            inactiveTextColor={theme.textSecondary}
                        />
                    </View>
                </View>
            </View>

            <View style={[styles.divider, { backgroundColor: withOpacity(theme.border, 0.7) }]} />

            <View
                style={[
                    styles.allTimePanel,
                    allTimeActive && styles.sectionActive,
                    allTimeActive && { backgroundColor: withOpacity(theme.primary, 0.07), borderColor: withOpacity(theme.primary, 0.18) },
                ]}
            >
                <View style={{ flex: 1 }}>
                    <View style={styles.panelTitleRow}>
                        <AppText
                            variant="body"
                            weight="semibold"
                            style={{ fontFamily: fonts.semibold, color: allTimeActive ? theme.primary : theme.text }}
                        >
                            All time
                        </AppText>
                        {allTimeActive ? (
                            <View
                                style={[
                                    styles.activeBadge,
                                    {
                                        backgroundColor: withOpacity(theme.primary, 0.14),
                                        borderColor: withOpacity(theme.primary, 0.2),
                                    },
                                ]}
                            >
                                <AppText variant="caption" style={{ color: theme.primary, fontFamily: fonts.semibold }}>
                                    Selected
                                </AppText>
                            </View>
                        ) : null}
                    </View>
                    <AppText
                        variant="caption"
                        style={{
                            color: allTimeActive ? withOpacity(theme.primary, 0.92) : theme.textSecondary,
                            fontFamily: allTimeActive ? fonts.medium : fonts.regular,
                        }}
                    >
                        {allTimeActive ? 'No date filter applied.' : 'Remove date filtering entirely.'}
                    </AppText>
                </View>
                <AppButton
                    variant={allTimeActive ? 'primary' : 'secondary'}
                    onPress={onSelectAllTime}
                    size="sm"
                    style={styles.allTimeBtn}
                >
                    {allTimeActive ? 'Selected' : 'Use'}
                </AppButton>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingBottom: Spacing.xxxl,
        gap: Spacing.md,
    },
    section: {
        gap: Spacing.md,
    },
    sectionActive: {
        borderWidth: 1,
        borderRadius: Shape.radius.r4,
        padding: Spacing.md,
        marginHorizontal: -Spacing.xs,
    },
    panelHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.md,
    },
    panelTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.sm,
        marginBottom: 2,
    },
    panelIcon: {
        width: 32,
        height: 32,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    activeBadge: {
        borderWidth: 1,
        borderRadius: Shape.radius.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
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
    },
    divider: {
        height: 1,
        marginVertical: Spacing.xs,
    },
    customRangeRow: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    inputButton: {
        flex: 1,
        borderWidth: 1,
        borderRadius: Shape.radius.r4,
        padding: Spacing.md,
        gap: Spacing.xs,
        minHeight: 76,
        justifyContent: 'center',
    },
    lastNRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    numberInputContainer: {
        width: 68,
        height: 50,
        borderRadius: Shape.radius.r4,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    numberInput: {
        fontSize: Typography.sizes.xl,
        textAlign: 'center',
        width: '100%',
    },
    unitSelector: {
        flex: 1,
        maxWidth: 320,
        justifyContent: 'center',
        alignSelf: 'center',
    },
    allTimePanel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.xs,
    },
    allTimeBtn: {
        minWidth: 84,
    },
});
