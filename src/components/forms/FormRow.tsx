import { AppIcon, AppText, Icon, ListRow, type IconName } from '@/src/components/core';
import { useTheme } from '@/src/hooks/use-theme';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import React from 'react';
import { Pressable, View } from 'react-native';

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
  accessibilityLabel?: string;
}

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
  accessibilityLabel,
}: FormRowProps) {
  const { theme } = useTheme();
  const hasValue = Boolean(value);
  const clearControl =
    onClear && hasValue ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.clearValue(title)}
        onPress={event => {
          event?.stopPropagation?.();
          onClear();
        }}
        hitSlop={8}
      >
        <AppIcon name={Icon.Close} size={18} color={theme.textSecondary} />
      </Pressable>
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
  const trailingAction = onPress ? (trailing ?? clearControl) : undefined;
  return (
    <ListRow
      leading={<AppIcon name={icon} size={22} color={theme.icon} />}
      title={
        <AppText variant="body" style={{ color: theme.text, flexShrink: 1 }}>
          {title}
        </AppText>
      }
      subtitle={
        subtitle ? (
          <AppText variant="caption" style={{ color: theme.textSecondary, flexShrink: 1 }}>
            {subtitle}
          </AppText>
        ) : undefined
      }
      trailing={right}
      trailingAction={trailingAction}
      trailingMaxWidth={trailing ? undefined : '55%'}
      showSeparator={showSeparator}
      onPress={onPress}
      testID={testID}
      accessibilityLabel={
        accessibilityLabel ??
        copy.formRowAccessibility(
          title,
          subtitle,
          trailing ? undefined : value,
          trailing ? undefined : placeholder,
        )
      }
    />
  );
}
