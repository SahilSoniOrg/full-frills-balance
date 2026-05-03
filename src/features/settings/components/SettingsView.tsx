import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { SettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import React from 'react';

export function SettingsView(vm: SettingsViewModel) {
  const { theme } = useTheme();

  return (
    <Screen title="Settings" showBack={false} alignTitle="left" scrollable>
      <Inset space="md" vertical="md">
        <Stack space="xl">
          <SettingsMenu header={AppConfig.strings.settings.sections.moneySetup}>
            <SettingsMenuItem
              leftIcon="user"
              title={AppConfig.strings.settings.sections.personalization}
              description="Name, default currency, and Safe-to-Spend forecast"
              onPress={vm.onPersonalizationSettings}
              prominent
            />
            <SettingsMenuItem
              leftIcon="briefcase"
              title="Workplace"
              description="Create and switch between workplaces"
              onPress={vm.onWorkplaceSettings}
              prominent
            />
          </SettingsMenu>

          <SettingsMenu header={AppConfig.strings.settings.sections.experience}>
            <SettingsMenuItem
              leftIcon="palette"
              title={AppConfig.strings.settings.sections.appearance}
              description="Theme, typography, mode, and account card details"
              onPress={vm.onAppearanceSettings}
              prominent
            />
            <SettingsMenuItem
              leftIcon="notifications"
              title={AppConfig.strings.settings.sections.remindersAndAutomation}
              description="Review reminders, SMS inbox, and auto-post rules"
              onPress={vm.onAutomationSettings}
              prominent
            />
          </SettingsMenu>

          <SettingsMenu header={AppConfig.strings.settings.sections.protection}>
            <SettingsMenuItem
              leftIcon="shieldCheck"
              title={AppConfig.strings.settings.sections.privacyAndSecurity}
              description="Hide balances, protect widgets, and lock the app"
              onPress={vm.onPrivacySecuritySettings}
              prominent
            />
          </SettingsMenu>

          <SettingsMenu header={AppConfig.strings.settings.sections.ledgerData}>
            <SettingsMenuItem
              leftIcon="database"
              title={AppConfig.strings.settings.sections.dataManagement}
              description="Back up, restore, share, and review your ledger"
              onPress={vm.onDataManagementSettings}
              prominent
            />
            <SettingsMenuItem
              leftIcon="wrench"
              title={AppConfig.strings.settings.sections.maintenanceAndReset}
              description="Verify books, purge deleted records, or reset the app"
              onPress={vm.onMaintenanceSettings}
              prominent
            />
          </SettingsMenu>

          <SettingsMenu header={AppConfig.strings.settings.sections.app}>
            <SettingsMenuItem
              leftIcon="info"
              title={AppConfig.strings.settings.sections.aboutAndSupport}
              description="Community, ratings, source code, and version"
              onPress={vm.onAboutSupportSettings}
              prominent
            />
          </SettingsMenu>

          <Box alignItems="center" marginTop="xl" paddingBottom="xl">
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
