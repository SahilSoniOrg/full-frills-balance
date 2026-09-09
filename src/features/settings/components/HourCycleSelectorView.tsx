import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { SettingsSegmentedControl } from '@/src/components/settings/SettingsSegmentedControl';
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
    <SettingsSegmentedControl
      leftIcon={Icon.Clock}
      focusId={focusId}
      title={AppConfig.strings.settings.appearance.hourCycleTitle}
      description={AppConfig.strings.settings.appearance.hourCycleDesc}
      titleMeta={hourCycleHint(hourCyclePreference, resolvedHourCycle)}
      options={HOUR_CYCLE_OPTIONS}
      value={hourCyclePreference}
      onChange={setHourCyclePreference}
    />
  );
}
