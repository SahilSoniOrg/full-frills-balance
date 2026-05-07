import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { BugReportService } from '@/src/services/BugReportService';
import { useTheme } from '@/src/hooks/use-theme';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import React from 'react';
import { Linking } from 'react-native';

export default function AboutSupportSettingsScreen() {
  const { theme } = useTheme();

  return (
    <Screen title={AppConfig.strings.settings.sections.aboutAndSupport} showBack scrollable>
      <Inset space="md" vertical="md">
        <Stack space="xl">
          <SettingsMenu header={AppConfig.strings.settings.sections.communitySupport}>
            <SettingsMenuItem
              leftIcon="messageCircle"
              iconColor
              title={AppConfig.strings.settings.community.telegramTitle}
              description={AppConfig.strings.settings.community.telegramDesc}
              onPress={() => Linking.openURL('https://t.me/FullFrills')}
            />
            <SettingsMenuItem
              leftIcon="star"
              iconColor
              title={AppConfig.strings.settings.community.playStoreTitle}
              description={AppConfig.strings.settings.community.playStoreDesc}
              onPress={() =>
                Linking.openURL(
                  'https://play.google.com/store/apps/details?id=in.sahilsoni.fullfrillsbalance',
                )
              }
            />
            <SettingsMenuItem
              leftIcon="github"
              iconColor
              title={AppConfig.strings.settings.community.githubTitle}
              description={AppConfig.strings.settings.community.githubDesc}
              onPress={() => Linking.openURL('https://github.com/SahilSoniOrg/full-frills-balance')}
            />
            <SettingsMenuItem
              leftIcon="bug"
              iconColor
              title="Report a Bug"
              description="Share app logs and device info to help fix issues"
              onPress={() => BugReportService.shareReport()}
            />
          </SettingsMenu>

          <Box alignItems="center" paddingBottom="xl">
            <AppText variant="caption" color="secondary" align="center">
              {AppConfig.strings.settings.version(
                Application.nativeApplicationVersion || AppConfig.appVersion,
              )}{' '}
              ({Application.nativeBuildVersion || '1'})
              {Constants.expoConfig?.extra?.gitCommit
                ? ` - ${Constants.expoConfig.extra.gitCommit}`
                : ''}
            </AppText>
            <AppText
              variant="caption"
              color="secondary"
              align="center"
              style={{ marginTop: Spacing.xs }}
            >
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
        </Stack>
      </Inset>
    </Screen>
  );
}
