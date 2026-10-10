import {
  AppIcon,
  AppText,
  Icon,
  ListRow,
  listRowTextInset,
  type IconName,
} from '@/src/components/core';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { Spacing } from '@/src/constants/design-tokens';
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

/** A form field row on ListRow: icon, title, value or placeholder, chevron; optional clear. */
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
  // Controls next to a pressable row sit outside its touch target so both stay accessible.
  const outside = onPress ? (trailing ?? clearControl) : null;
  const inside = trailing ? (
    onPress ? undefined : (
      trailing
    )
  ) : (
    <>
      {!onPress ? clearControl : null}
      <AppText variant="bodySmall" color="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
        {hasValue ? value : placeholder}
      </AppText>
    </>
  );

  const row = (
    <ListRow
      leading={<AppIcon name={icon} size={22} color={theme.icon} />}
      title={
        <AppText variant="body" style={{ flexShrink: 1 }}>
          {title}
        </AppText>
      }
      subtitle={
        subtitle ? (
          <AppText variant="caption" color="secondary" style={{ flexShrink: 1 }}>
            {subtitle}
          </AppText>
        ) : undefined
      }
      trailing={inside}
      chevron={!trailing}
      trailingMaxWidth={trailing ? undefined : '55%'}
      onPress={onPress}
      testID={testID}
      accessibilityLabel={copy.formRowAccessibility(
        title,
        subtitle,
        trailing ? undefined : value,
        trailing ? undefined : placeholder,
      )}
      {...(outside ? { style: { flex: 1 }, paddingRight: 0 } : null)}
    />
  );

  return (
    <View>
      {outside ? (
        <Box flexDirection="row" alignItems="center" paddingRight="lg">
          {row}
          <Box marginLeft="md">{outside}</Box>
        </Box>
      ) : (
        row
      )}
      {showSeparator ? (
        <Separator width="auto" marginLeft={listRowTextInset('card', Spacing.xl)} />
      ) : null}
    </View>
  );
}
