import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';

export function SettingsFooter() {
  const { theme } = useTheme();

  return (
    <Box alignItems="center" marginTop="xl" paddingBottom="xl">
      <AppText variant="caption" color="secondary" align="center">
        {AppConfig.strings.settings.version(
          Application.nativeApplicationVersion || AppConfig.appVersion,
        )}{' '}
        ({Application.nativeBuildVersion || '1'})
        {Constants.expoConfig?.extra?.gitCommit ? ` - ${Constants.expoConfig.extra.gitCommit}` : ''}
      </AppText>
      <AppText variant="caption" color="secondary" align="center" style={{ marginTop: Spacing.xs }}>
        <Inline space="xs" align="center" justify="center">
          <AppText variant="caption" color="secondary">
            Made with
          </AppText>
          <AppIcon name="heart" size={12} color={theme.error} />
          <AppText variant="caption" color="secondary">
            for financial freedom
          </AppText>
        </Inline>
      </AppText>
    </Box>
  );
}
