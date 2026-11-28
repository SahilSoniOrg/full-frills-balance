import {
  AppButton,
  AppIcon,
  AppInputField,
  AppSegmentedControl,
  AppText,
  FilterChipButton,
  Icon,
  PersonAvatar,
  PressScaleTouchable,
} from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { Inline, Stack } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { AccountId, PersonId } from '@/src/types/ids';
import type { IconName } from '@/src/types/domainIcons';

export type SplitParticipant = { id: PersonId; name: string; icon?: IconName; color?: string };
export type SplitModeChoice = 'equal' | 'custom';

export type SplitQuickAddResult = AccountId | { id: AccountId; name: string } | void;

export type SplitPeopleParticipantsBarProps = {
  people: SplitParticipant[];
  selectedPersonIds: PersonId[];
  onTogglePerson: (personId: PersonId) => void;
  onQuickAddPerson: (name: string) => Promise<SplitQuickAddResult>;
  hasParticipants: boolean;
  splitMode: SplitModeChoice;
  onChangeSplitMode: (mode: SplitModeChoice) => void;
  remainingAmountText: string;
  isMatched?: boolean;
  canAddRemainingToYours: boolean;
  onAddRemainingToYours: () => void;
  isQuickAdding: boolean;
};

const SPLIT_MODE_OPTIONS: readonly { id: SplitModeChoice; label: string }[] = [
  { label: 'Auto split', id: 'equal' },
  { label: 'Custom', id: 'custom' },
];

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
  const isMatched = props.isMatched ?? props.remainingAmountText === '0';

  return (
    <Stack gap="sm" style={styles.container}>
      <Inline justifyContent="space-between" alignItems="center" gap="sm">
        <AppText variant="body" weight="bold" color="primary">
          Participants
        </AppText>
        {props.hasParticipants ? (
          <AppSegmentedControl
            testID="split-participant-split-mode"
            size="sm"
            options={SPLIT_MODE_OPTIONS}
            value={props.splitMode}
            onChange={props.onChangeSplitMode}
          />
        ) : null}
      </Inline>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Inline gap="sm" alignItems="center">
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
                <Inline gap="xs" alignItems="center">
                  <PersonAvatar
                    name={person.name}
                    icon={person.icon}
                    color={selected ? theme.primary : person.color}
                    size={24}
                    maxChars={1}
                    style={
                      selected
                        ? { backgroundColor: withOpacity(theme.primary, Opacity.medium) }
                        : undefined
                    }
                  />
                  <AppText variant="caption" weight={selected ? 'semibold' : 'medium'}>
                    {person.name}
                  </AppText>
                  {selected ? <AppIcon name={Icon.Check} size={Size.xxs} color="primary" /> : null}
                </Inline>
              </PressScaleTouchable>
            );
          })}
          <FilterChipButton
            label="+ Quick add"
            isActive={quickAdd}
            onPress={() => setQuickAdd(value => !value)}
            style={styles.quickAddChip}
          />
        </Inline>
      </ScrollView>

      {quickAdd ? (
        <Inline gap="sm" alignItems="center">
          <AppInputField
            value={name}
            onChangeText={setName}
            placeholder="Person name"
            style={styles.quickAddInput}
          />
          <AppButton
            size="sm"
            onPress={submit}
            loading={props.isQuickAdding}
            disabled={!name.trim()}
          >
            Add
          </AppButton>
        </Inline>
      ) : null}

      {props.hasParticipants && !isMatched ? (
        <Inline justifyContent="space-between" alignItems="center" gap="sm" flexWrap="wrap">
          <Inline gap="xs" alignItems="center">
            <AppIcon name={Icon.Info} size={Size.xs} color={theme.warning} />
            <AppText variant="caption" weight="medium" color="secondary">
              {`Remaining to assign: ${props.remainingAmountText}`}
            </AppText>
          </Inline>
          {props.canAddRemainingToYours ? (
            <PressScaleTouchable
              testID="split-add-remaining"
              accessibilityRole="button"
              onPress={props.onAddRemainingToYours}
              surfaceStyle={[
                styles.addRemainingPill,
                {
                  backgroundColor: withOpacity(theme.primary, Opacity.soft),
                  borderColor: withOpacity(theme.primary, Opacity.heavy),
                },
              ]}
            >
              <AppText variant="caption" weight="semibold" color="primary">
                Add remaining to yours
              </AppText>
            </PressScaleTouchable>
          ) : null}
        </Inline>
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
    minHeight: Size.touchTarget,
    justifyContent: 'center',
  },
  quickAddChip: {
    borderStyle: 'dashed',
  },
  quickAddInput: {
    flex: 1,
  },
  addRemainingPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
  },
});
