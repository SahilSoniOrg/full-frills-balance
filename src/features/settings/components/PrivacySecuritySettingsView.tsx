import { ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import {
  usePrivacySettingsViewModel,
  type PrivacySettingsViewModel,
} from '@/src/features/settings/hooks/usePrivacySettingsViewModel';

interface PrivacySecuritySettingsViewProps {
  vm: PrivacySettingsViewModel;
}

export function PrivacySecuritySettingsView({ vm }: PrivacySecuritySettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.privacyAndSecurity}>
      <ListGroup
        variant="plain"
        header={AppConfig.strings.settings.sections.protectFinancialDetails}
      >
        <ListRow
          focusId="privacy-security"
          icon={Icon.Shield}
          title={AppConfig.strings.settings.privacy.title}
          subtitle={AppConfig.strings.settings.privacy.description}
          trailing={<ListRow.Toggle value={vm.isPrivacyMode} onValueChange={vm.onTogglePrivacy} />}
        />
        <ListRow
          focusId="widget-privacy"
          icon={Icon.EyeOff}
          title={AppConfig.strings.settings.privacy.widgetPrivacyTitle}
          subtitle={AppConfig.strings.settings.privacy.widgetPrivacyDesc}
          trailing={
            <ListRow.Toggle
              value={vm.isWidgetPrivacyEnabled}
              onValueChange={vm.onToggleWidgetPrivacy}
            />
          }
        />
        <ListRow
          focusId="app-lock"
          icon={Icon.Lock}
          title={AppConfig.strings.settings.privacy.appLockTitle}
          subtitle={AppConfig.strings.settings.privacy.appLockDesc}
          testID="settings-app-lock-toggle"
          trailing={
            <ListRow.Toggle value={vm.isAppLockEnabled} onValueChange={vm.onToggleAppLock} />
          }
        />
      </ListGroup>
    </SettingsLayout>
  );
}

export default function PrivacySecuritySettingsScreen() {
  const vm = usePrivacySettingsViewModel();
  return <PrivacySecuritySettingsView vm={vm} />;
}
