import { AppSegmentedControl, AppText, ListRow, ListGroup } from '@/src/components/core';
import { Inline } from '@/src/design-system';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import {
  HOUR_CYCLE_PREFERENCES,
  type HourCyclePreference,
  type ResolvedHourCycle,
} from '@/src/utils/hourCycle';

type HourCycleSelectorProps = {
  hourCyclePreference: HourCyclePreference;
  resolvedHourCycle: ResolvedHourCycle;
  setHourCyclePreference: (pref: HourCyclePreference) => void;
  focusId?: string;
};

const HOUR_CYCLE_LABELS: Record<HourCyclePreference, string> = {
  system: AppConfig.strings.settings.appearance.hourCycleSystem,
  '12-hour': AppConfig.strings.settings.appearance.hourCycle12,
  '24-hour': AppConfig.strings.settings.appearance.hourCycle24,
};

const HOUR_CYCLE_OPTIONS = HOUR_CYCLE_PREFERENCES.map(id => ({
  id,
  label: HOUR_CYCLE_LABELS[id],
}));

function hourCycleHint(preference: HourCyclePreference, resolved: ResolvedHourCycle): string {
  const copy = AppConfig.strings.settings.appearance;
  if (preference === 'system') {
    return resolved === '12-hour' ? copy.hourCycleHintSystem12 : copy.hourCycleHintSystem24;
  }
  return preference === '12-hour' ? copy.hourCycleHint12 : copy.hourCycleHint24;
}

export function HourCycleSelectorView({
  hourCyclePreference,
  resolvedHourCycle,
  setHourCyclePreference,
  focusId,
}: HourCycleSelectorProps) {
  return (
    <ListGroup variant="plain">
      <ListRow
        icon={Icon.Clock}
        focusId={focusId}
        title={
          <Inline align="center" space="sm">
            <AppText variant="body" weight="semibold">
              {AppConfig.strings.settings.appearance.hourCycleTitle}
            </AppText>
            <AppText variant="caption" color="secondary">
              {hourCycleHint(hourCyclePreference, resolvedHourCycle)}
            </AppText>
          </Inline>
        }
        subtitle={AppConfig.strings.settings.appearance.hourCycleDesc}
      >
        <AppSegmentedControl
          options={HOUR_CYCLE_OPTIONS}
          value={hourCyclePreference}
          onChange={setHourCyclePreference}
          flex
          size="md"
        />
      </ListRow>
    </ListGroup>
  );
}
