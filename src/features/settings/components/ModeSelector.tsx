import { AppText } from '@/src/components/core';
import { AppButton } from '@/src/components/core/AppButton';
import { AppConfig, Spacing } from '@/src/constants';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface ModeSelectorProps {
  themePreference: 'system' | 'light' | 'dark';
  setThemePreference: (pref: 'system' | 'light' | 'dark') => void;
}

export function ModeSelector({ themePreference, setThemePreference }: ModeSelectorProps) {
  return (
    <View style={styles.container}>
      <AppText variant="subheading" style={styles.sectionTitle}>
        {AppConfig.strings.settings.appearance.modeTitle}
      </AppText>

      <View style={styles.modeRow}>
        {(['system', 'light', 'dark'] as const).map(pref => (
          <AppButton
            key={pref}
            variant={themePreference === pref ? 'primary' : 'outline'}
            size="sm"
            onPress={() => setThemePreference(pref)}
            style={{ flex: 1 }}
          >
            {pref.charAt(0).toUpperCase() + pref.slice(1)}
          </AppButton>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
