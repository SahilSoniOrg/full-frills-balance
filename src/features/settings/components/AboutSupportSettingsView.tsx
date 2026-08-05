import type { ScreenNavChrome } from '@/src/components/layout';
import { AppIcon } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { AboutSupportViewModel } from '@/src/features/settings/hooks/useAboutSupportViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { TouchableOpacity } from 'react-native';

interface AboutSupportSettingsViewProps {
  chrome: ScreenNavChrome;
  vm: AboutSupportViewModel;
}

export function AboutSupportSettingsView({ vm, chrome }: AboutSupportSettingsViewProps) {
  const { theme } = useTheme();

  return (
    <SettingsLayout chrome={chrome}>
      <SettingsMenu header={AppConfig.strings.settings.sections.communitySupport}>
        <SettingsMenuItem
          leftIcon="messageCircle"
          iconColor
          title={AppConfig.strings.settings.community.telegramTitle}
          description={AppConfig.strings.settings.community.telegramDesc}
          onPress={vm.onOpenTelegram}
        />
        <SettingsMenuItem
          leftIcon="star"
          iconColor
          title={AppConfig.strings.settings.community.playStoreTitle}
          description={AppConfig.strings.settings.community.playStoreDesc}
          onPress={vm.onOpenPlayStore}
        />
        <SettingsMenuItem
          leftIcon="github"
          iconColor
          title={AppConfig.strings.settings.community.githubTitle}
          description={AppConfig.strings.settings.community.githubDesc}
          onPress={vm.onOpenGithub}
        />
        <SettingsMenuItem
          leftIcon="bug"
          iconColor
          title="Report a Bug"
          description="Share app logs and device info to help fix issues"
          onPress={vm.onShareBugReport}
          hasArrow={false}
          rightContent={
            <Inline space="md">
              <TouchableOpacity
                onPress={vm.onShareBugReport}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Box padding="xs">
                  <AppIcon name="share" size={20} color={theme.primary} />
                </Box>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={vm.onSaveBugReport}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Box padding="xs">
                  <AppIcon name="save" size={20} color={theme.primary} />
                </Box>
              </TouchableOpacity>
            </Inline>
          }
        />
      </SettingsMenu>
    </SettingsLayout>
  );
}
