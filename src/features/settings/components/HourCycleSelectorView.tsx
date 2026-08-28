import { AppSegmentedControl, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import {
  HOUR_CYCLE_PREFERENCES,
  type HourCyclePreference,
  type ResolvedHourCycle,
} from '@/src/utils/hourCycle';
import { StyleSheet, View } from 'react-native';

type HourCycleSelectorProps = {
  hourCyclePreference: HourCyclePreference;
  resolvedHourCycle: ResolvedHourCycle;
  setHourCyclePreference: (pref: HourCyclePreference) => void;
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
}: HourCycleSelectorProps) {
  return (
    <View>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="subheading">
            {AppConfig.strings.settings.appearance.hourCycleTitle}
          </AppText>
          <AppText variant="caption" color="secondary" weight="regular">
            {hourCycleHint(hourCyclePreference, resolvedHourCycle)}
          </AppText>
        </View>
        <AppText variant="caption" color="secondary" style={styles.sectionDesc}>
          {AppConfig.strings.settings.appearance.hourCycleDesc}
        </AppText>
      </View>

      <AppSegmentedControl
        options={HOUR_CYCLE_OPTIONS}
        value={hourCyclePreference}
        onChange={setHourCyclePreference}
        flex
        size="md"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionDesc: {
    marginTop: 4,
  },
});
