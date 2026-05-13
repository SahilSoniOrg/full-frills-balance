import { AppButton, AppIcon, AppSegmentedControl, AppText } from '@/src/components/core';
import { Layout, Opacity, Shape, Spacing, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { PeriodFilter } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import React from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface DateRangeMenuContentProps {
  draftFilter: PeriodFilter;
  customRange: { startDate: any; endDate: any };
  lastNValue: string;
  lastNUnit: 'days' | 'weeks' | 'months';
  monthList: { month: number; year: number; label: string }[];
  onSelectMonth: (month: number, year: number) => void;
  onSelectCustom: () => void;
  onSelectAllTime: () => void;
  onShowStartDate: () => void;
  onShowEndDate: () => void;
  onUpdateLastN: (value: string, unit: 'days' | 'weeks' | 'months') => void;
}

export function DateRangeMenuContent({
  draftFilter,
  customRange,
  lastNValue,
  lastNUnit,
  monthList,
  onSelectMonth,
  onSelectCustom,
  onSelectAllTime,
  onShowStartDate,
  onShowEndDate,
  onUpdateLastN,
}: DateRangeMenuContentProps) {
  const { theme, fonts } = useTheme();

  const monthPanelActive = draftFilter.type === 'MONTH';
  const customPanelActive = draftFilter.type === 'CUSTOM';
  const rollingPanelActive = draftFilter.type === 'LAST_N';
  const allTimeActive = draftFilter.type === 'ALL_TIME';
  const selectedMonthLabel =
    draftFilter.type === 'MONTH'
      ? monthList.find(item => item.month === draftFilter.month && item.year === draftFilter.year)
          ?.label
      : null;
  const customSummary =
    customRange.startDate || customRange.endDate
      ? `${customRange.startDate ? customRange.startDate.format('DD MMM YYYY') : 'Start'} - ${
          customRange.endDate ? customRange.endDate.format('DD MMM YYYY') : 'Now'
        }`
      : null;
  const rollingSummary =
    lastNValue.trim().length > 0
      ? `Using last ${lastNValue.trim()} ${lastNUnit}`
      : 'Enter a range length';

  const getMonthId = (month: number, year: number) => `${year}-${month}`;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View
        style={[
          styles.section,
          monthPanelActive && styles.sectionActive,
          monthPanelActive && {
            backgroundColor: withOpacity(theme.primary, Opacity.selection),
            borderColor: withOpacity(theme.primary, Opacity.active),
          },
        ]}
      >
        <View style={styles.panelHeader}>
          <View
            style={[
              styles.panelIcon,
              {
                backgroundColor: withOpacity(
                  theme.primary,
                  monthPanelActive ? Opacity.active : Opacity.hover,
                ),
              },
            ]}
          >
            <AppIcon name="calendar" size={16} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.panelTitleRow}>
              <AppText
                variant="body"
                weight="semibold"
                style={{
                  fontFamily: fonts.semibold,
                  color: monthPanelActive ? theme.primary : theme.text,
                }}
              >
                Choose month
              </AppText>
              {monthPanelActive ? (
                <View
                  style={[
                    styles.activeBadge,
                    {
                      backgroundColor: withOpacity(theme.primary, Opacity.soft),
                      borderColor: withOpacity(theme.primary, Opacity.active),
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    style={{ color: theme.primary, fontFamily: fonts.semibold }}
                  >
                    Selected
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText
              variant="caption"
              style={{
                color: monthPanelActive
                  ? withOpacity(theme.primary, Opacity.high)
                  : theme.textSecondary,
                fontFamily: monthPanelActive ? fonts.medium : fonts.regular,
              }}
            >
              {monthPanelActive && selectedMonthLabel
                ? selectedMonthLabel
                : 'Quick monthly snapshots for reports and trends.'}
            </AppText>
          </View>
        </View>
        <View style={{ marginTop: Spacing.sm }}>
          <AppSegmentedControl<string>
            scrollable
            variant="minimal"
            itemWidth={Layout.datePicker.monthSlider.itemWidth}
            options={monthList.map(item => ({
              id: getMonthId(item.month, item.year),
              label: item.label,
            }))}
            value={
              draftFilter.type === 'MONTH' &&
              draftFilter.month !== undefined &&
              draftFilter.year !== undefined
                ? getMonthId(draftFilter.month, draftFilter.year)
                : getMonthId(dayjs().month(), dayjs().year())
            }
            onChange={id => {
              const [year, month] = id.split('-').map(Number);
              onSelectMonth(month, year);
            }}
          />
        </View>
      </View>

      <View
        style={[styles.divider, { backgroundColor: withOpacity(theme.border, Opacity.heavy) }]}
      />

      <View
        style={[
          styles.section,
          customPanelActive && styles.sectionActive,
          customPanelActive && {
            backgroundColor: withOpacity(theme.primary, Opacity.selection),
            borderColor: withOpacity(theme.primary, Opacity.active),
          },
        ]}
      >
        <TouchableOpacity style={styles.panelHeader} onPress={onSelectCustom} activeOpacity={0.7}>
          <View
            style={[
              styles.panelIcon,
              {
                backgroundColor: withOpacity(
                  customPanelActive ? theme.primary : theme.warning,
                  customPanelActive ? Opacity.active : Opacity.hover,
                ),
              },
            ]}
          >
            <AppIcon
              name="timeline"
              size={16}
              color={customPanelActive ? theme.primary : theme.warning}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.panelTitleRow}>
              <AppText
                variant="body"
                weight="semibold"
                style={{
                  fontFamily: fonts.semibold,
                  color: customPanelActive ? theme.primary : theme.text,
                }}
              >
                Custom range
              </AppText>
              {customPanelActive ? (
                <View
                  style={[
                    styles.activeBadge,
                    {
                      backgroundColor: withOpacity(theme.primary, Opacity.soft),
                      borderColor: withOpacity(theme.primary, Opacity.active),
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    style={{ color: theme.primary, fontFamily: fonts.semibold }}
                  >
                    Selected
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText
              variant="caption"
              style={{
                color: customPanelActive
                  ? withOpacity(theme.primary, Opacity.high)
                  : theme.textSecondary,
                fontFamily: customPanelActive ? fonts.medium : fonts.regular,
              }}
            >
              {customPanelActive && customSummary
                ? customSummary
                : 'Pick exact start and end dates.'}
            </AppText>
          </View>
        </TouchableOpacity>

        <View style={styles.customRangeRow}>
          <TouchableOpacity
            style={[
              styles.inputButton,
              {
                borderColor: customPanelActive
                  ? withOpacity(theme.primary, Opacity.muted)
                  : withOpacity(theme.border, Opacity.medium),
                backgroundColor: customPanelActive
                  ? withOpacity(theme.primary, Opacity.selection)
                  : 'transparent',
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
                borderColor: customPanelActive
                  ? withOpacity(theme.primary, Opacity.muted)
                  : withOpacity(theme.border, Opacity.medium),
                backgroundColor: customPanelActive
                  ? withOpacity(theme.primary, Opacity.selection)
                  : 'transparent',
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

      <View
        style={[styles.divider, { backgroundColor: withOpacity(theme.border, Opacity.heavy) }]}
      />

      <View
        style={[
          styles.section,
          rollingPanelActive && styles.sectionActive,
          rollingPanelActive && {
            backgroundColor: withOpacity(theme.primary, Opacity.selection),
            borderColor: withOpacity(theme.primary, Opacity.active),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.panelHeader}
          onPress={() => onUpdateLastN(lastNValue, lastNUnit)}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.panelIcon,
              {
                backgroundColor: withOpacity(
                  rollingPanelActive ? theme.primary : theme.success,
                  rollingPanelActive ? Opacity.active : Opacity.hover,
                ),
              },
            ]}
          >
            <AppIcon
              name="refresh"
              size={16}
              color={rollingPanelActive ? theme.primary : theme.success}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.panelTitleRow}>
              <AppText
                variant="body"
                weight="semibold"
                style={{
                  fontFamily: fonts.semibold,
                  color: rollingPanelActive ? theme.primary : theme.text,
                }}
              >
                Rolling window
              </AppText>
              {rollingPanelActive ? (
                <View
                  style={[
                    styles.activeBadge,
                    {
                      backgroundColor: withOpacity(theme.primary, Opacity.soft),
                      borderColor: withOpacity(theme.primary, Opacity.active),
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    style={{ color: theme.primary, fontFamily: fonts.semibold }}
                  >
                    Selected
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText
              variant="caption"
              style={{
                color: rollingPanelActive
                  ? withOpacity(theme.primary, Opacity.high)
                  : theme.textSecondary,
                fontFamily: rollingPanelActive ? fonts.medium : fonts.regular,
              }}
            >
              {rollingPanelActive ? rollingSummary : 'Great for “last 7 days” or “last 3 months”.'}
            </AppText>
          </View>
        </TouchableOpacity>

        <View style={styles.lastNRow}>
          <View
            style={[
              styles.numberInputContainer,
              {
                backgroundColor: rollingPanelActive
                  ? withOpacity(theme.primary, Opacity.selection)
                  : 'transparent',
                borderColor: rollingPanelActive
                  ? withOpacity(theme.primary, Opacity.muted)
                  : withOpacity(theme.border, Opacity.medium),
              },
            ]}
          >
            <TextInput
              style={[styles.numberInput, { color: theme.text, fontFamily: fonts.bold }]}
              value={lastNValue}
              onChangeText={text => onUpdateLastN(text, lastNUnit)}
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
              onChange={unit => onUpdateLastN(lastNValue, unit as 'days' | 'weeks' | 'months')}
              flex
              size="md"
              trackColor={
                rollingPanelActive
                  ? withOpacity(theme.primary, Opacity.hover)
                  : withOpacity(theme.surfaceSecondary, Opacity.medium)
              }
              pillColor={withOpacity(theme.primary, Opacity.active)}
              activeTextColor={theme.primary}
              inactiveTextColor={theme.textSecondary}
            />
          </View>
        </View>
      </View>

      <View
        style={[styles.divider, { backgroundColor: withOpacity(theme.border, Opacity.heavy) }]}
      />

      <View
        style={[
          styles.allTimePanel,
          allTimeActive && styles.sectionActive,
          allTimeActive && {
            backgroundColor: withOpacity(theme.primary, Opacity.selection),
            borderColor: withOpacity(theme.primary, Opacity.active),
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.panelTitleRow}>
            <AppText
              variant="body"
              weight="semibold"
              style={{
                fontFamily: fonts.semibold,
                color: allTimeActive ? theme.primary : theme.text,
              }}
            >
              All time
            </AppText>
            {allTimeActive ? (
              <View
                style={[
                  styles.activeBadge,
                  {
                    backgroundColor: withOpacity(theme.primary, Opacity.soft),
                    borderColor: withOpacity(theme.primary, Opacity.active),
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  style={{ color: theme.primary, fontFamily: fonts.semibold }}
                >
                  Selected
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText
            variant="caption"
            style={{
              color: allTimeActive ? withOpacity(theme.primary, Opacity.high) : theme.textSecondary,
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
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: Shape.radius.r4,
    marginHorizontal: -Spacing.xs,
  },
  sectionActive: {
    // Styling (border and background) is applied inline dynamically
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
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: Shape.radius.r4,
    marginHorizontal: -Spacing.xs,
  },
  allTimeBtn: {
    minWidth: 84,
  },
});
