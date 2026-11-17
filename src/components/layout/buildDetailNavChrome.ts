import type { ScreenFabChrome, ScreenNavChrome } from '@/src/components/layout/screenChrome';
import type { ReactNode } from 'react';

export type DetailNavChromePhase = 'loading' | 'missing' | 'ready';

type BuildDetailNavChromeParams = {
  phase: DetailNavChromePhase;
  readyTitle: string;
  onBack: () => void;
  loadingTitle?: string;
  headerActions?: ReactNode;
  fab?: ScreenFabChrome;
};

export function buildDetailNavChrome({
  phase,
  readyTitle,
  onBack,
  loadingTitle = 'Details',
  headerActions,
  fab,
}: BuildDetailNavChromeParams): ScreenNavChrome {
  const screenTitle = phase === 'ready' ? readyTitle : loadingTitle;

  return {
    kind: 'nav',
    screenTitle,
    onBack,
    headerActions: phase === 'ready' ? headerActions : undefined,
    fab: phase === 'ready' ? fab : undefined,
  };
}
