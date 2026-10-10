import { AppIcon, AppText, Icon, ListRow, type IconName } from '@/src/components/core';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { Spacing, SpacingKey } from '@/src/constants/design-tokens';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { Box } from '@/src/design-system/Box';
import { Separator } from '@/src/design-system/Separator';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { View } from 'react-native';

export interface FormRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  value?: string | null;
  placeholder?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onClear?: () => void;
  showSeparator?: boolean;
  testID?: string;
}

const PADDING_HORIZONTAL: SpacingKey = 'lg';
const PADDING_VERTICAL: SpacingKey = 'sm';

export function FormRow({
  icon,
  title,
  subtitle,
  value,
  placeholder,
  trailing,
  onPress,
  onClear,
  showSeparator = true,
  testID,
}: FormRowProps) {
  const { theme } = useTheme();
  const hasValue = Boolean(value);
  const clearControl =
    onClear && hasValue ? (
      <PressScaleTouchable
        accessibilityRole="button"
        accessibilityLabel={copy.clearValue(title)}
        onPress={event => {
          event?.stopPropagation?.();
          onClear();
        }}
        hitSlop={8}
      >
        <AppIcon name={Icon.Close} size={18} color={theme.textSecondary} />
      </PressScaleTouchable>
    ) : null;
  const right = trailing ? (
    onPress ? undefined : (
      trailing
    )
  ) : (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}
    >
      {!onPress ? clearControl : null}
      <AppText
        variant="bodySmall"
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ color: theme.textSecondary, flexShrink: 1, minWidth: 0 }}
      >
        {hasValue ? value : placeholder}
      </AppText>
      <View style={{ flexShrink: 0 }}>
        <AppIcon name={Icon.ChevronRight} size={20} color={theme.textSecondary} />
      </View>
    </View>
  );
  const splitTrailing = onPress ? (trailing ?? clearControl) : undefined;
  const accessibilityLabel = copy.formRowAccessibility(
    title,
    subtitle,
    trailing ? undefined : value,
    trailing ? undefined : placeholder,
  );
  const leading = <AppIcon name={icon} size={22} color={theme.icon} />;
  const titleNode = (
    <AppText variant="body" style={{ color: theme.text, flexShrink: 1 }}>
      {title}
    </AppText>
  );
  const subtitleNode = subtitle ? (
    <AppText variant="caption" style={{ color: theme.textSecondary, flexShrink: 1 }}>
      {subtitle}
    </AppText>
  ) : undefined;

  if (splitTrailing) {
    const separatorInset = Spacing[PADDING_HORIZONTAL] + Spacing.xl + Spacing.md;
    const row = (
      <View>
        <Box
          flexDirection="row"
          alignItems="center"
          paddingHorizontal={PADDING_HORIZONTAL}
          paddingVertical={PADDING_VERTICAL}
        >
          <PressScaleTouchable
            style={{ flex: 1, alignSelf: 'stretch' }}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            testID={testID}
          >
            <Box flex={1} flexDirection="row" alignItems="center">
              <Box minWidth={Spacing.xl} marginRight="md" alignItems="center">
                {leading}
              </Box>
              <Box flex={1} justifyContent="center">
                {titleNode}
                {subtitleNode}
              </Box>
              {right}
            </Box>
          </PressScaleTouchable>
          <Box marginLeft="md" alignItems="flex-end">
            {splitTrailing}
          </Box>
        </Box>
        {showSeparator ? <Separator width="auto" marginLeft={separatorInset} /> : null}
      </View>
    );
    return row;
  }

  return (
    <ListRow
      leading={leading}
      title={titleNode}
      subtitle={subtitleNode}
      trailing={right}
      trailingMaxWidth={trailing ? undefined : '55%'}
      showSeparator={showSeparator}
      onPress={onPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
