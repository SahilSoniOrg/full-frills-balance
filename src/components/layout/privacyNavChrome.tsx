import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import {
  ScreenHeaderActions,
  type ScreenHeaderActionItem,
} from '@/src/components/shared/ScreenHeaderActions';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';

/** Stack screen with privacy eye — Hub, Reports, InsightDetails, Search, etc. */
export function privacyNavChrome(
  screenTitle: string,
  onBack: () => void,
  options?: { actions?: ScreenHeaderActionItem[] },
): ScreenNavChrome {
  const actions = options?.actions ?? [];
  return {
    kind: 'nav',
    screenTitle,
    onBack,
    headerActions: <ScreenHeaderActions actions={actions} trailing={<PrivacyToggleButton />} />,
  };
}
