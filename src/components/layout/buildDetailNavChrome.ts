import type { ScreenFabChrome, ScreenNavChrome } from '@/src/components/layout/screenChrome';
import type { ReactNode } from 'react';

export type DetailNavChromePhase = 'loading' | 'missing' | 'ready';

type BuildDetailNavChromeParams = {
  phase: DetailNavChromePhase;
  readyTitle: string;
  loadingTitle?: string;
  missingBackIcon?: ScreenNavChrome['backIcon'];
  headerActions?: ReactNode;
  fab?: ScreenFabChrome;
};

export function buildDetailNavChrome({
  phase,
  readyTitle,
  loadingTitle = 'Details',
  missingBackIcon = 'back',
  headerActions,
  fab,
}: BuildDetailNavChromeParams): ScreenNavChrome {
  const screenTitle = phase === 'ready' ? readyTitle : loadingTitle;
  const backIcon = phase === 'missing' ? missingBackIcon : 'back';

  return {
    screenTitle,
    showBack: true,
    backIcon,
    headerActions: phase === 'ready' ? headerActions : undefined,
    fab: phase === 'ready' ? fab : undefined,
  };
}
