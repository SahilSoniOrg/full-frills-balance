import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { DateRange, formatDate, formatShortDate } from '@/src/utils/dateUtils';
import React, { useMemo } from 'react';
import { Keyboard, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

interface DateRangeTriggerProps {
  range?: DateRange | null;
  label?: string;
  onPress: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  style?: StyleProp<ViewStyle>;
  showNavigationArrows?: boolean;
  fullWidth?: boolean;
}

export function DateRangeTrigger({
  range = null,
  label,
  onPress,
  onPrevious,
  onNext,
  style,
  showNavigationArrows = true,
  fullWidth = false,
}: DateRangeTriggerProps) {
  const { theme, fonts } = useTheme();
  const showNavigation = !!(onPrevious && onNext) && showNavigationArrows;

  const displayText = useMemo(() => {
    if (label) return label;
    if (!range) return AppConfig.strings.common.allTime;

    const start = new Date(range.startDate);
    const end = new Date(range.endDate);

    if (start.toDateString() === end.toDateString()) {
      return formatDate(start);
    }

    if (range.label) return range.label;

    return `${formatShortDate(start)} - ${formatShortDate(end)}`;
  }, [label, range]);

  return (
    <View style={[styles.wrapper, style]}>
      {showNavigation ? (
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            onPrevious?.();
          }}
          style={[styles.navButton, { backgroundColor: theme.surface }, Shape.elevation.sm]}
          activeOpacity={Opacity.heavy}
        >
          <AppIcon name="chevronLeft" size={Size.sm} color={theme.textSecondary} />
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[
          styles.container,
          { backgroundColor: theme.surface },
          Shape.elevation.sm,
          fullWidth && { flex: 1, justifyContent: 'center' },
        ]}
        onPress={() => {
          Keyboard.dismiss();
          onPress();
        }}
        activeOpacity={Opacity.heavy}
      >
        <AppIcon name="calendar" size={Size.sm} color={theme.primary} />
        <AppText
          variant="body"
          style={[styles.text, { flexShrink: 1, fontFamily: fonts.medium }]}
          numberOfLines={1}
        >
          {displayText}
        </AppText>
        <AppIcon name="chevronDown" size={Size.xs} color={theme.textSecondary} />
      </TouchableOpacity>

      {showNavigation ? (
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            onNext?.();
          }}
          style={[styles.navButton, { backgroundColor: theme.surface }, Shape.elevation.sm]}
          activeOpacity={Opacity.heavy}
        >
          <AppIcon name="chevronRight" size={Size.sm} color={theme.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  navButton: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Size.xl,
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.full,
    gap: Spacing.sm,
  },
  text: {
    fontSize: Typography.sizes.sm,
    marginHorizontal: Spacing.xs,
  },
});
