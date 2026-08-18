import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import type { AccountFields as Account } from '@/src/types/domain';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { EntryEditBanner } from '@/src/features/journal/entry/components/EntryEditBanner';
import { JournalSuggestions } from '@/src/features/journal/entry/components/JournalSuggestions';
import { useTheme } from '@/src/hooks/use-theme';
import { TabType } from '@/src/types/domain';
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
  onSelectSuggestion?: (suggestion: JournalAutofillSuggestion) => void;
  activeTabType?: TabType;
  accounts?: Account[];
  notes?: string;
  setNotes?: (notes: string) => void;
  style?: StyleProp<ViewStyle>;
  showBanner?: boolean;
  bannerText?: string;
  suggestions?: JournalAutofillSuggestion[];
  hideSuggestions?: boolean;
  onDescriptionFocus?: () => void;
  onVoiceInputPress?: () => void;
}

/** Minimal, tight meta strip used by journal entry (date / description / notes). */
export function JournalMetaCard({
  date,
  setDate,
  time,
  setTime,
  description,
  setDescription,
  onSelectSuggestion,
  activeTabType,
  accounts = [],
  notes = '',
  setNotes,
  style,
  showBanner,
  bannerText,
  suggestions = [],
  hideSuggestions = false,
  onDescriptionFocus,
  onVoiceInputPress,
}: JournalMetaCardProps) {
  const { theme } = useTheme();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showNotes, setShowNotes] = useState(!!notes);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);

  React.useEffect(() => {
    if (notes) {
      setTimeout(() => setShowNotes(true), 0);
    }
  }, [notes]);

  return (
    <View
      style={[
        {
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.sm,
        },
        style,
      ]}
    >
      <View style={{ gap: Spacing.sm }}>
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
                fontSize: 15,
                fontWeight: '500',
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
                <AppIcon name="mic" size={Size.iconXs} color={theme.primary} />
              </TouchableOpacity>
            )}
          </View>

          {isDescriptionFocused && !hideSuggestions && suggestions.length > 0 && (
            <JournalSuggestions
              suggestions={suggestions}
              accounts={accounts}
              activeTabType={activeTabType}
              onSelect={suggestion => {
                if (onSelectSuggestion) {
                  onSelectSuggestion(suggestion);
                } else {
                  setDescription(suggestion.description);
                }
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
                fontSize: 13,
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
            marginTop: -Spacing.xs,
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
              backgroundColor: theme.surfaceSecondary,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.xs,
              borderRadius: Shape.radius.full,
            }}
          >
            <AppIcon name="calendar" size={Size.iconXs} color={theme.textSecondary} />
            <AppText variant="caption" color="secondary" weight="medium">
              {dayjs(`${date}T${time}`).format('DD MMM YYYY, HH:mm')}
            </AppText>
            <AppIcon name="chevronDown" size={12} color={theme.textTertiary} />
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
    </View>
  );
}
