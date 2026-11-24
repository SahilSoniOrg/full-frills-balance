import { EmptyStateView, Icon } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import { NOT_FOUND_STRINGS } from '@/src/constants/copy/domains/notFoundStrings';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useNotFoundTracking } from './hooks/useNotFoundTracking';

/**
 * Not Found - custom unmatched-route screen.
 * Replaces Expo Router's built-in unmatched page, which exposes the route index.
 */
export function NotFoundScreen() {
  useNotFoundTracking();

  return (
    <ScreenWithChrome
      chrome={{ kind: 'plain', screenTitle: NOT_FOUND_STRINGS.headerTitle }}
      edges={['top', 'bottom']}
    >
      <EmptyStateView
        icon={Icon.Search}
        title={NOT_FOUND_STRINGS.title}
        subtitle={NOT_FOUND_STRINGS.subtitle}
        primaryActionLabel={NOT_FOUND_STRINGS.action}
        onPrimaryAction={AppNavigation.toDashboard}
      />
    </ScreenWithChrome>
  );
}
