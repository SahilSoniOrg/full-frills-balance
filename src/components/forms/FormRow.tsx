import { AppIcon, Icon, ListRow, type IconName } from '@/src/components/core';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { Box } from '@/src/design-system/Box';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';

export interface FormRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  value?: string | null;
  placeholder?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onClear?: () => void;
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
  // The clear control sits outside the row's touch target so both stay accessible.
  const outside = clearControl;
  const inside = trailing ?? (
    <ListRow.Value variant="bodySmall" numberOfLines={1}>
      {hasValue ? value : placeholder}
    </ListRow.Value>
  );

  const row = (
    <ListRow
      leading={<AppIcon name={icon} size={22} color={theme.icon} />}
      title={title}
      subtitle={subtitle}
      wrap
      trailing={inside}
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

  return outside ? (
    <Box flexDirection="row" alignItems="center" paddingRight="lg">
      {row}
      <Box marginLeft="md">{outside}</Box>
    </Box>
  ) : (
    row
  );
}
