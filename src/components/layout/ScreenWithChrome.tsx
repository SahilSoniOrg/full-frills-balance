import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout/Screen';
import type { ScreenProps } from '@/src/components/layout/Screen';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';

type ScreenWithChromeProps = Omit<
  ScreenProps,
  'title' | 'showBack' | 'backIcon' | 'headerActions' | 'isSearchActive' | 'alignTitle'
> & {
  chrome: ScreenChrome;
};

export function ScreenWithChrome({ chrome, children, ...rest }: ScreenWithChromeProps) {
  const fab = chrome.fab;

  return (
    <Screen
      title={chrome.screenTitle}
      showBack={chrome.showBack ?? false}
      backIcon={chrome.backIcon}
      headerActions={chrome.headerActions}
      isSearchActive={chrome.isSearchActive}
      alignTitle={chrome.alignTitle}
      {...rest}
    >
      {children}
      {fab ? (
        <FloatingActionButton
          onPress={fab.onPress}
          label={fab.label}
          icon={fab.icon}
          placement={fab.placement}
          accessibilityLabel={fab.accessibilityLabel}
        />
      ) : null}
    </Screen>
  );
}
