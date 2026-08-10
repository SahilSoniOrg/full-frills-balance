import {
  ScreenHeaderActions,
  type ScreenHeaderActionItem,
} from '@/src/components/common/ScreenHeaderActions';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';

export function buildAccountFormScreenChrome(
  heroTitle: string,
  headerActionItems: ScreenHeaderActionItem[],
): ScreenNavChrome {
  return {
    screenTitle: heroTitle,
    showBack: true,
    backIcon: 'back',
    headerActions:
      headerActionItems.length > 0 ? (
        <ScreenHeaderActions actions={headerActionItems} />
      ) : undefined,
  };
}
