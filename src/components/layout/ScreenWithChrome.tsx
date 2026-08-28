import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout/Screen';
import { Spacing } from '@/src/constants';
import type { ScreenProps } from '@/src/components/layout/Screen';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';

type ScreenWithChromeProps = Omit<
  ScreenProps,
  'title' | 'showBack' | 'backIcon' | 'headerActions' | 'isSearchActive' | 'onBack' | 'headerStyle'
> & {
  chrome: ScreenChrome;
};

/** Renders Screen chrome. Back / header style / FAB come only from `chrome`. */
export function ScreenWithChrome({ chrome, children, ...rest }: ScreenWithChromeProps) {
  const fab = chrome.fab;

  const showBack = chrome.showBack ?? false;
  const edges: ScreenProps['edges'] = rest.edges ?? (showBack ? ['top', 'bottom'] : ['top']);

  return (
    <Screen
      {...rest}
      edges={edges}
      title={chrome.screenTitle}
      backIcon={chrome.backIcon}
      headerActions={chrome.headerActions}
      isSearchActive={chrome.isSearchActive}
      headerStyle={chrome.headerStyle}
      {...(showBack && chrome.onBack
        ? { showBack: true as const, onBack: chrome.onBack }
        : { showBack: false as const })}
    >
      {children}
      {fab ? (
        <FloatingActionButton
          onPress={fab.onPress}
          label={fab.label}
          icon={fab.icon}
          placement={fab.placement}
          accessibilityLabel={fab.accessibilityLabel}
          // Tab roots already sit above the tab bar; don't add the system
          // bottom inset a second time. Pushed screens retain safe-area spacing.
          bottomOffset={showBack ? undefined : Spacing.xl}
        />
      ) : null}
    </Screen>
  );
}
