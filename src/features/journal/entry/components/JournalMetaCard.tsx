import { DateTimePickerModal } from '@/src/components/filters/DateTimePickerModal';
import { Icon, AppIcon, AppInput, AppText, IconButton } from '@/src/components/core';
import { EntryEditBanner } from '@/src/features/journal/entry/components/EntryEditBanner';
import {
  JournalSuggestionsDropdown,
  type JournalSuggestionState,
} from '@/src/features/journal/entry/components/JournalSuggestionsDropdown';
import { AppConfig } from '@/src/constants';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { TabType } from '@/src/types/domainJournal';
import { withOpacity } from '@/src/utils/color-math';
import { formatDateKeepingPattern } from '@/src/utils/dateUtils';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Keyboard,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

export interface JournalMetaCardProps {
  description: string;
  setDescription: (desc: string) => void;
  date: string;
  setDate: (date: string) => void;
  time: string;
  setTime: (time: string) => void;
  notes?: string;
  setNotes?: (notes: string) => void;
  /** Journal or line notes already exist, even when the journal note string is empty. */
  notesAdded?: boolean;
  /** When set, the parent owns visibility so the header and rows update together. */
  showNotes?: boolean;
  onNotesVisibilityChange?: (visible: boolean) => void;
  suggestions?: JournalAutofillSuggestion[];
  suggestionState?: JournalSuggestionState;
  suggestionMaxHeight?: number;
  onSelectSuggestion?: (suggestion: JournalAutofillSuggestion) => void;
  activeTabType?: TabType;
  accounts?: AccountFields[];
  onVoiceInputPress?: () => void;
  showBanner?: boolean;
  bannerText?: string;
  onDescriptionFocus?: () => void;
  hideSuggestions?: boolean;
  onDescriptionSubmitEditing?: () => void;
  descriptionInputRef?: RefObject<TextInput | null>;
  onDateTimePickerRequest?: () => void;
  leadingContent?: ReactNode;
  trailingAction?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  descriptionTestID?: string;
  descriptionClearTestID?: string;
}

export const JournalMetaCard = React.memo(function JournalMetaCard({
  description,
  setDescription,
  date,
  setDate,
  time,
  setTime,
  notes = '',
  setNotes,
  notesAdded = false,
  showNotes: showNotesProp,
  onNotesVisibilityChange,
  suggestions = [],
  suggestionState = 'idle',
  suggestionMaxHeight,
  onSelectSuggestion,
  activeTabType,
  accounts = [],
  onVoiceInputPress,
  showBanner,
  bannerText,
  onDescriptionFocus,
  hideSuggestions = false,
  onDescriptionSubmitEditing,
  descriptionInputRef,
  onDateTimePickerRequest,
  leadingContent,
  trailingAction,
  containerStyle,
  descriptionTestID = 'journal-description-input',
  descriptionClearTestID = 'clear-description-button',
}: JournalMetaCardProps) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isNotesControlled = showNotesProp !== undefined;
  const [uncontrolledNotesVisible, setUncontrolledNotesVisible] = useState(() => !!notes);
  const showNotes = isNotesControlled ? showNotesProp : uncontrolledNotesVisible;
  const setShowNotes = useCallback(
    (visible: boolean) => {
      onNotesVisibilityChange?.(visible);
      if (!isNotesControlled) setUncontrolledNotesVisible(visible);
    },
    [isNotesControlled, onNotesVisibilityChange],
  );
  const [isFocused, setIsFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const formattedDateTime = useMemo(() => {
    const raw = `${date}T${time}`;
    return formatDateKeepingPattern(raw, 'DD MMM YYYY', resolvedHourCycle);
  }, [date, time, resolvedHourCycle]);

  const handleSelectSuggestion = useCallback(
    (suggestion: JournalAutofillSuggestion) => {
      Keyboard.dismiss();
      setIsFocused(false);
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      if (onSelectSuggestion) {
        onSelectSuggestion(suggestion);
      } else {
        setDescription(suggestion.description);
      }
    },
    [onSelectSuggestion, setDescription],
  );

  return (
    <View style={[styles.container, containerStyle]}>
      {showBanner && <EntryEditBanner text={bannerText || ''} style={styles.banner} />}

      {/* Description Input Container with Absolute Floating Dropdown */}
      <View style={styles.inputContainer}>
        {/* Description Input Row - Ghost with subtle focus underline */}
        <View
          style={[
            styles.inputRow,
            {
              borderBottomColor: isFocused ? theme.primary : withOpacity(theme.border, 0.7),
            },
          ]}
        >
          <View style={styles.leadingSlot}>
            {leadingContent ?? (
              <AppIcon
                name={Icon.Document}
                size={Size.iconXs}
                color={isFocused ? theme.primary : theme.textTertiary}
              />
            )}
          </View>
          <AppInput
            ref={descriptionInputRef}
            value={description}
            onChangeText={setDescription}
            onFocus={() => {
              if (blurTimerRef.current) {
                clearTimeout(blurTimerRef.current);
                blurTimerRef.current = null;
              }
              setIsFocused(true);
              onDescriptionFocus?.();
            }}
            onBlur={() => {
              if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
              blurTimerRef.current = setTimeout(() => {
                blurTimerRef.current = null;
                setIsFocused(false);
              }, 250);
            }}
            onSubmitEditing={() => {
              descriptionInputRef?.current?.blur();
              onDescriptionSubmitEditing?.();
            }}
            placeholder={AppConfig.strings.advancedEntry.descriptionPlaceholder}
            variant="minimal"
            flex={1}
            style={styles.descriptionInput}
            testID={descriptionTestID}
          />

          {description ? (
            <TouchableOpacity
              onPress={() => setDescription('')}
              style={styles.trailingAction}
              accessibilityLabel="Clear description"
              accessibilityRole="button"
              testID={descriptionClearTestID}
            >
              <AppIcon name={Icon.Close} size={Size.xs} color={theme.textTertiary} />
            </TouchableOpacity>
          ) : null}

          {trailingAction ??
            (onVoiceInputPress && (
              <IconButton
                name={Icon.Mic}
                variant="clear"
                size={Size.iconXs}
                iconColor={theme.primary}
                onPress={onVoiceInputPress}
                accessibilityLabel="Voice input"
                style={styles.trailingAction}
              />
            ))}
        </View>

        <JournalSuggestionsDropdown
          visible={isFocused}
          hideSuggestions={hideSuggestions}
          suggestions={suggestions}
          suggestionState={suggestionState}
          activeTabType={activeTabType}
          accounts={accounts}
          onSelectSuggestion={handleSelectSuggestion}
          maxHeight={suggestionMaxHeight}
        />
      </View>

      {/* Date & Notes Pill Row (Ghost, Breathable - Does not get pushed down) */}
      <View style={styles.metaRow}>
        {/* Date Picker Pill */}
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            if (onDateTimePickerRequest) {
              onDateTimePickerRequest();
            } else {
              setShowDatePicker(true);
            }
          }}
          style={[
            styles.metaPill,
            { backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.strong), flexShrink: 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Change date and time"
        >
          <AppIcon name={Icon.Calendar} size={Size.xxs} color={theme.textSecondary} />
          <AppText
            variant="caption"
            color="secondary"
            weight="medium"
            numberOfLines={1}
            style={styles.metaPillLabel}
          >
            {formattedDateTime}
          </AppText>
          <AppIcon name={Icon.ChevronDown} size={Size.xxs} color={theme.textTertiary} />
        </TouchableOpacity>

        {/* Notes Disclosure Toggle */}
        {setNotes && (
          <TouchableOpacity
            onPress={() => setShowNotes(!showNotes)}
            style={[
              styles.metaPill,
              {
                backgroundColor: showNotes
                  ? withOpacity(theme.primary, Opacity.soft)
                  : withOpacity(theme.surfaceSecondary, Opacity.strong),
                flexShrink: 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={showNotes ? 'Hide notes' : 'Add notes'}
          >
            <AppIcon
              name={Icon.Edit}
              size={Size.xxs}
              color={showNotes ? theme.primary : theme.textSecondary}
            />
            <AppText
              variant="caption"
              weight="medium"
              numberOfLines={1}
              style={[
                styles.metaPillLabel,
                { color: showNotes ? theme.primary : theme.textSecondary },
              ]}
            >
              {notes || notesAdded ? 'Notes added' : 'Add notes'}
            </AppText>
          </TouchableOpacity>
        )}
      </View>

      {/* Expandable Notes Input */}
      {setNotes && showNotes && (
        <View
          style={[
            styles.notesContainer,
            {
              backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.heavy),
              borderColor: theme.border,
            },
          ]}
        >
          <AppInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any extra journal details or tags..."
            multiline
            variant="minimal"
            style={[styles.notesInput, { color: theme.textSecondary }]}
            testID="journal-notes-input"
          />
        </View>
      )}

      {!onDateTimePickerRequest && (
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
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    position: 'relative',
    zIndex: 100,
  },
  banner: {
    marginBottom: Spacing.xs,
    borderRadius: Shape.radius.md,
  },
  inputContainer: {
    position: 'relative',
    zIndex: 100,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    minHeight: Size.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leadingSlot: {
    marginRight: Spacing.sm,
    justifyContent: 'center',
  },
  descriptionInput: {
    fontSize: Typography.sizes.base,
    fontWeight: '500',
  },
  trailingAction: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    minWidth: 0,
    flexShrink: 1,
  },
  metaPillLabel: {
    flexShrink: 1,
    minWidth: 0,
  },
  notesContainer: {
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: Shape.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notesInput: {
    fontSize: Typography.sizes.sm,
    fontWeight: '400',
    minHeight: Size.xl,
    textAlignVertical: 'top',
  },
});
