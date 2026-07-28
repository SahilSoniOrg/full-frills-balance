import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppCard, AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { EntryEditBanner } from '@/src/features/journal/entry/components/EntryEditBanner';
import { JournalSuggestions } from '@/src/features/journal/entry/components/JournalSuggestions';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { Keyboard, StyleProp, TouchableOpacity, View, ViewStyle } from 'react-native';

interface JournalMetaCardProps {
  date: string;
  setDate: (date: string) => void;
  time: string;
  setTime: (time: string) => void;
  description: string;
  setDescription: (desc: string) => void;
  notes?: string;
  setNotes?: (notes: string) => void;
  style?: StyleProp<ViewStyle>;
  showBanner?: boolean;
  bannerText?: string;
  variant?: 'default' | 'minimal';
  density?: 'default' | 'tight';
  suggestions?: string[];
  hideSuggestions?: boolean;
  onDescriptionFocus?: () => void;
  onVoiceInputPress?: () => void;
}

export function JournalMetaCard({
  date,
  setDate,
  time,
  setTime,
  description,
  setDescription,
  notes = '',
  setNotes,
  style,
  showBanner,
  bannerText,
  variant = 'default',
  density = 'default',
  suggestions = [],
  hideSuggestions = false,
  onDescriptionFocus,
  onVoiceInputPress,
}: JournalMetaCardProps) {
  const { theme } = useTheme();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showNotes, setShowNotes] = useState(!!notes);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);
  const isMinimal = variant === 'minimal';
  const isTight = density === 'tight';
  const sectionGap = isTight ? Spacing.sm : Spacing.md;

  React.useEffect(() => {
    if (notes) {
      setTimeout(() => setShowNotes(true), 0);
    }
  }, [notes]);

  const content = (
    <View style={{ gap: sectionGap }}>
      {showBanner && (
        <EntryEditBanner text={bannerText || ''} style={{ marginHorizontal: 0, marginTop: 0 }} />
      )}

      <View style={{ zIndex: 10, position: 'relative' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <AppInput
            value={description}
            onChangeText={setDescription}
            onFocus={() => {
              setIsDescriptionFocused(true);
              onDescriptionFocus?.();
            }}
            onPressIn={() => {
              onDescriptionFocus?.();
            }}
            onBlur={() => {
              // Small delay to allow tapping suggestions before they disappear
              setTimeout(() => setIsDescriptionFocused(false), 200);
            }}
            placeholder={AppConfig.strings.advancedEntry.descriptionPlaceholder}
            testID="journal-description-input"
            variant="minimal"
            flex={1}
            width="auto"
            style={{
              fontSize: isTight ? 15 : isMinimal ? 16 : 18,
              fontWeight: isMinimal ? '500' : '600',
            }}
          />
          {onVoiceInputPress && (
            <TouchableOpacity
              onPress={onVoiceInputPress}
              style={{
                padding: Spacing.sm,
                marginLeft: Spacing.xs,
              }}
              activeOpacity={0.7}
            >
              <AppIcon
                name="mic"
                size={isMinimal ? Size.iconXs : Size.iconSm}
                color={theme.primary}
              />
            </TouchableOpacity>
          )}
        </View>

        {isDescriptionFocused && !hideSuggestions && suggestions.length > 0 && (
          <JournalSuggestions
            suggestions={suggestions}
            onSelect={suggestion => {
              setDescription(suggestion);
              Keyboard.dismiss();
            }}
          />
        )}
      </View>

      {setNotes && showNotes && (
        <View
          style={{
            backgroundColor: theme.surfaceSecondary,
            borderRadius: Shape.radius.md,
            padding: Spacing.sm,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: Spacing.sm,
            marginTop: -Spacing.xs,
            borderWidth: 1,
            borderColor: theme.border,
            position: 'relative',
          }}
        >
          <AppIcon
            name="document"
            size={Size.iconXs}
            color={theme.textTertiary}
            style={{ marginTop: 4 }}
          />
          <AppInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any extra journal details..."
            multiline
            variant="minimal"
            style={{
              flex: 1,
              textAlignVertical: 'top',
              fontSize: isMinimal ? 13 : 14,
              fontWeight: '400',
              color: theme.textSecondary,
              padding: 0,
              margin: 0,
              marginRight: Spacing.lg,
            }}
          />
          <TouchableOpacity
            onPress={() => {
              setNotes('');
              setShowNotes(false);
            }}
            style={{
              position: 'absolute',
              top: Spacing.xs,
              right: Spacing.xs,
              padding: 6,
              zIndex: 1,
            }}
          >
            <AppIcon name="x" size={14} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {setNotes && !showNotes && (
        <TouchableOpacity
          onPress={() => setShowNotes(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xs,
            alignSelf: 'flex-end',
            marginTop: -Spacing.xs,
          }}
        >
          <AppIcon name="plus" size={14} color={theme.primary} />
          <AppText variant="caption" color="primary" weight="medium">
            Add Notes
          </AppText>
        </TouchableOpacity>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          marginTop: isMinimal ? -Spacing.xs : 0,
        }}
      >
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            setShowDatePicker(true);
          }}
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
      <View
        style={[
          {
            paddingHorizontal: isTight ? Spacing.lg : Spacing.xl,
            paddingBottom: isTight ? Spacing.sm : Spacing.md,
          },
          style,
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <AppCard elevation="sm" padding="lg" style={style} overflow="visible">
      {content}
    </AppCard>
  );
}
