import { AppSegmentedControl, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

type ThemePreference = 'system' | 'light' | 'dark';

type ModeSelectorProps = {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
};

const MODE_OPTIONS = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const;

export function ModeSelectorView({ themePreference, setThemePreference }: ModeSelectorProps) {
  return (
    <View>
      <View style={styles.headerRow}>
        <View style={styles.copy}>
          <AppText variant="subheading">{AppConfig.strings.settings.appearance.modeTitle}</AppText>
          <AppText variant="caption" color="secondary" style={styles.sectionDesc}>
            Choose how the selected theme follows your device.
          </AppText>
        </View>
      </View>

      <AppSegmentedControl
        options={MODE_OPTIONS}
        value={themePreference}
        onChange={setThemePreference}
        flex
        size="md"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  copy: {
    flex: 1,
  },
  sectionDesc: {
    marginTop: 4,
  },
});
