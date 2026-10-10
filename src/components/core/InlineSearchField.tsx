import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { Icon } from '@/src/types/domainIcons';
import { AppIcon } from '@/src/components/core/AppIcon';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, TextInput, View } from 'react-native';
import { useEaseInLayoutAnimation } from '@/src/hooks/useEaseInLayoutAnimation';
import { useCallback, useRef, useState } from 'react';

interface UseExpandableSearchProps {
  value: string;
  onChangeText: (text: string) => void;
  onExpandChange?: (isExpanded: boolean) => void;
}

function useExpandableSearch({ value, onChangeText, onExpandChange }: UseExpandableSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const prepareLayoutAnimation = useEaseInLayoutAnimation();

  const shouldStayExpanded = value.length > 0;

  const handleExpand = useCallback(() => {
    prepareLayoutAnimation();
    setIsExpanded(true);
    onExpandChange?.(true);
    setTimeout(() => inputRef.current?.focus(), AppConfig.timing.focusDelayMs);
  }, [onExpandChange, prepareLayoutAnimation]);

  const handleCollapse = useCallback(() => {
    if (shouldStayExpanded) return;
    prepareLayoutAnimation();
    setIsExpanded(false);
    onExpandChange?.(false);
    inputRef.current?.blur();
  }, [shouldStayExpanded, onExpandChange, prepareLayoutAnimation]);

  const handleClear = useCallback(() => {
    onChangeText('');
    inputRef.current?.focus();
  }, [onChangeText]);

  return {
    isExpanded: isExpanded || shouldStayExpanded,
    handleExpand,
    handleCollapse,
    handleClear,
    inputRef,
  };
}

export interface InlineSearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onExpandChange?: (isExpanded: boolean) => void;
}

/**
 * InlineSearchField — search icon that expands in-place to a text field.
 * Use when search happens on the current screen.
 */
export const InlineSearchField = ({
  value,
  onChangeText,
  placeholder = AppConfig.strings.common.searchPlaceholder,
  onExpandChange,
}: InlineSearchFieldProps) => {
  const { theme, fonts } = useTheme();
  const { isExpanded, handleExpand, handleCollapse, handleClear, inputRef } = useExpandableSearch({
    value,
    onChangeText,
    onExpandChange,
  });

  if (!isExpanded) {
    return (
      <PressScaleTouchable
        onPress={handleExpand}
        style={[styles.iconButton, { backgroundColor: theme.surface }, Shape.elevation.sm]}
        hitSlop={Spacing.sm}
        activeOpacity={Opacity.heavy}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
      >
        <AppIcon name={Icon.Search} size={Size.sm} color={theme.text} />
      </PressScaleTouchable>
    );
  }

  return (
    <View
      style={[
        styles.expandedContainer,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        Shape.elevation.sm,
      ]}
    >
      <AppIcon name={Icon.Search} size={Size.sm} color={theme.textSecondary} style={styles.icon} />
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: theme.text, fontFamily: fonts.regular }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        selectionColor={theme.primary}
        autoFocus
      />
      <PressScaleTouchable
        onPress={value.length > 0 ? handleClear : handleCollapse}
        style={styles.clearButton}
        hitSlop={Spacing.sm}
        accessibilityRole="button"
        accessibilityLabel={value.length > 0 ? 'Clear search' : 'Collapse search'}
      >
        <AppIcon name={Icon.Close} size={Size.sm} color={theme.textSecondary} />
      </PressScaleTouchable>
    </View>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: Size.xl,
    minHeight: Size.xl,
    borderRadius: Shape.radius.full,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  icon: {},
  input: {
    flex: 1,
    fontSize: Typography.sizes.base,
    height: '100%',
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  clearButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
