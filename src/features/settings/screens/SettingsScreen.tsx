import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { SettingsView } from '@/src/features/settings/components/SettingsView';

const chrome: TabScreenChrome = {
  screenTitle: 'Settings',
  showBack: false,
  headerActions: null,
};

export default function SettingsScreen() {
  return <SettingsView chrome={chrome} />;
}
