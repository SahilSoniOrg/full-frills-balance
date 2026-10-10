import { ListGroup, ListRow, Icon, AppIcon } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import {
  useAboutSupportViewModel,
  type AboutSupportViewModel,
} from '@/src/features/settings/hooks/useAboutSupportViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { TouchableOpacity } from 'react-native';

interface AboutSupportSettingsViewProps {
  vm: AboutSupportViewModel;
}

export function AboutSupportSettingsView({ vm }: AboutSupportSettingsViewProps) {
  const { theme } = useTheme();

  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.aboutAndSupport}>
      <ListGroup
        variant="plain"
        header={AppConfig.strings.settings.sections.communitySupport}
        focusId="about-support"
      >
        <ListRow
          focusId="telegram"
          icon={Icon.MessageCircle}
          title={AppConfig.strings.settings.community.telegramTitle}
          subtitle={AppConfig.strings.settings.community.telegramDesc}
          onPress={vm.onOpenTelegram}
        />
        <ListRow
          focusId="release-notes"
          icon={Icon.Document}
          title={AppConfig.strings.settings.community.releaseNotesTitle}
          subtitle={AppConfig.strings.settings.community.releaseNotesDesc}
          onPress={vm.onOpenReleaseNotes}
          testID="settings-release-notes"
        />
        <ListRow
          focusId="play-store"
          icon={Icon.Star}
          title={AppConfig.strings.settings.community.playStoreTitle}
          subtitle={AppConfig.strings.settings.community.playStoreDesc}
          onPress={vm.onOpenPlayStore}
        />
        <ListRow
          focusId="github"
          icon={Icon.Github}
          title={AppConfig.strings.settings.community.githubTitle}
          subtitle={AppConfig.strings.settings.community.githubDesc}
          onPress={vm.onOpenGithub}
        />
        <ListRow
          focusId="report-bug"
          icon={Icon.Bug}
          title="Report a Bug"
          subtitle="Share app logs and device info to help fix issues"
          onPress={vm.onShareBugReport}
          chevron={false}
          trailing={
            <Inline space="md">
              <TouchableOpacity
                onPress={vm.onShareBugReport}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Box padding="xs">
                  <AppIcon name={Icon.Share} size={20} color={theme.primary} />
                </Box>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={vm.onSaveBugReport}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Box padding="xs">
                  <AppIcon name={Icon.Save} size={20} color={theme.primary} />
                </Box>
              </TouchableOpacity>
            </Inline>
          }
        />
      </ListGroup>
    </SettingsLayout>
  );
}

export default function AboutSupportSettingsScreen() {
  const vm = useAboutSupportViewModel();
  return <AboutSupportSettingsView vm={vm} />;
}
