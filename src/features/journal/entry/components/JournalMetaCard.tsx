import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppCard, AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { EntryEditBanner } from '@/src/features/journal/entry/components/EntryEditBanner';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { StyleProp, TouchableOpacity, View, ViewStyle } from 'react-native';

interface JournalMetaCardProps {
  date: string;
  setDate: (date: string) => void;
  time: string;
  setTime: (time: string) => void;
  description: string;
  setDescription: (desc: string) => void;
  style?: StyleProp<ViewStyle>;
  showBanner?: boolean;
  bannerText?: string;
  variant?: 'default' | 'minimal';
}

export function JournalMetaCard({
  date,
  setDate,
  time,
  setTime,
  description,
  setDescription,
  style,
  showBanner,
  bannerText,
  variant = 'default',
}: JournalMetaCardProps) {
  const { theme } = useTheme();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isMinimal = variant === 'minimal';

  const content = (
    <View style={{ gap: Spacing.md }}>
      {showBanner && (
        <EntryEditBanner text={bannerText || ''} style={{ marginHorizontal: 0, marginTop: 0 }} />
      )}

      <AppInput
        value={description}
        onChangeText={setDescription}
        placeholder={AppConfig.strings.advancedEntry.descriptionPlaceholder}
        multiline
        variant="minimal"
        style={{
          textAlignVertical: 'top',
          fontSize: isMinimal ? 16 : 18,
          fontWeight: isMinimal ? '500' : '600',
        }}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          marginTop: isMinimal ? -Spacing.xs : 0,
        }}
      >
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xs,
            backgroundColor: isMinimal ? theme.surfaceSecondary : 'transparent',
            paddingHorizontal: isMinimal ? Spacing.md : 0,
            paddingVertical: isMinimal ? Spacing.xs : 0,
            borderRadius: Shape.radius.full,
          }}
        >
          <AppIcon name="calendar" size={Size.iconXs} color={theme.textSecondary} />
          <AppText variant="caption" color="secondary" weight="medium">
            {dayjs(`${date}T${time}`).format('DD MMM YYYY, HH:mm')}
          </AppText>
          {isMinimal && <AppIcon name="chevronDown" size={12} color={theme.textTertiary} />}
        </TouchableOpacity>
      </View>

      <DateTimePickerModal
        visible={showDatePicker}
        date={date}
        time={time}
        onClose={() => setShowDatePicker(false)}
        onSelect={(d, t) => {
          setDate(d);
          setTime(t);
        }}
      />
    </View>
  );

  if (isMinimal) {
    return (
      <View style={[{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md }, style]}>
        {content}
      </View>
    );
  }

  return (
    <AppCard elevation="sm" padding="lg" style={style}>
      {content}
    </AppCard>
  );
}
