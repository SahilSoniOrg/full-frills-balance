import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';

/** Stack screen with privacy eye only — Hub, Reports, InsightDetails, etc. */
export function privacyNavChrome(screenTitle: string, onBack: () => void): ScreenNavChrome {
  return {
    screenTitle,
    showBack: true,
    backIcon: 'back',
    onBack,
    headerActions: <PrivacyToggleButton />,
  };
}
