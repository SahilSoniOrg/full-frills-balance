import {
  AppButton,
  AppIcon,
  AppInputField,
  AppSegmentedControl,
  AppText,
  Icon,
  PersonAvatar,
  PressScaleTouchable,
} from '@/src/components/core';
import { NoticeBanner } from '@/src/components/shared/NoticeBanner';
import { Opacity, Shape, Spacing } from '@/src/constants/design-tokens';
import { Inline, Stack } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { PersonId } from '@/src/types/ids';

export type SplitParticipant = { id: PersonId; name: string; color?: string };
export type SplitModeChoice = 'equal' | 'custom';

export type SplitPeopleParticipantsBarProps = {
  people: SplitParticipant[];
  selectedPersonIds: PersonId[];
  onTogglePerson: (personId: PersonId) => void;
  onQuickAddPerson: (name: string) => Promise<void>;
  hasParticipants: boolean;
  splitMode: SplitModeChoice;
  onChangeSplitMode: (mode: SplitModeChoice) => void;
  remainingAmountText: string;
  canAddRemainingToYours: boolean;
  onAddRemainingToYours: () => void;
  isQuickAdding: boolean;
};

export function SplitPeopleParticipantsBar(props: SplitPeopleParticipantsBarProps) {
  const { theme } = useTheme();
  const [quickAdd, setQuickAdd] = useState(false);
  const [name, setName] = useState('');
  const submit = async () => {
    if (!name.trim() || props.isQuickAdding) return;
    await props.onQuickAddPerson(name.trim());
    setName('');
    setQuickAdd(false);
  };
  return (
    <Stack gap="sm" style={styles.container}>
      <AppText variant="body" weight="bold" color="primary">
        Participants
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Inline gap="sm" align="center">
          {props.people.map(person => {
            const selected = props.selectedPersonIds.includes(person.id);
            return (
              <PressScaleTouchable
                key={person.id}
                onPress={() => props.onTogglePerson(person.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`split-participant-${person.id}`}
                surfaceStyle={[
                  styles.chip,
                  {
                    backgroundColor: selected
                      ? withOpacity(theme.primary, Opacity.soft)
                      : theme.surfaceSecondary,
                    borderColor: selected
                      ? theme.primary
                      : withOpacity(theme.border, Opacity.active),
                  },
                ]}
              >
                <Inline gap="xs" align="center">
                  <PersonAvatar name={person.name} size={24} maxChars={2} />
                  <AppText variant="caption" weight={selected ? 'semibold' : 'medium'}>
                    {person.name}
                  </AppText>
                  {selected ? <AppIcon name={Icon.Check} size={14} color="primary" /> : null}
                </Inline>
              </PressScaleTouchable>
            );
          })}
          <PressScaleTouchable
            onPress={() => setQuickAdd(v => !v)}
            accessibilityRole="button"
            surfaceStyle={[
              styles.chip,
              {
                backgroundColor: quickAdd
                  ? withOpacity(theme.primary, Opacity.soft)
                  : theme.surfaceSecondary,
                borderColor: quickAdd ? theme.primary : withOpacity(theme.border, Opacity.active),
              },
            ]}
          >
            <AppText variant="caption" weight="semibold" color="primary">
              + Quick add
            </AppText>
          </PressScaleTouchable>
        </Inline>
      </ScrollView>
      {quickAdd ? (
        <Inline gap="sm" align="center">
          <AppInputField
            value={name}
            onChangeText={setName}
            placeholder="Person name"
            style={styles.quickAddInput}
          />
          <AppButton onPress={submit} loading={props.isQuickAdding} disabled={!name.trim()}>
            Add
          </AppButton>
        </Inline>
      ) : null}
      {props.hasParticipants ? (
        <Stack gap="sm">
          <AppSegmentedControl
            testID="split-participant-split-mode"
            options={[
              { label: 'Equal split', id: 'equal' },
              { label: 'Custom', id: 'custom' },
            ]}
            value={props.splitMode}
            onChange={props.onChangeSplitMode}
          />
          <NoticeBanner
            message={
              props.remainingAmountText === '0'
                ? 'Exact match'
                : `Remaining to assign: ${props.remainingAmountText}`
            }
            tone={props.remainingAmountText === '0' ? 'neutral' : 'info'}
          />
          {props.canAddRemainingToYours ? (
            <AppButton testID="split-add-remaining" onPress={props.onAddRemainingToYours}>
              Add remaining to yours
            </AppButton>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  quickAddInput: {
    flex: 1,
  },
});
