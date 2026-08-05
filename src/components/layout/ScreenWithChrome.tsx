import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout/Screen';
import type { ScreenProps } from '@/src/components/layout/Screen';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';

type ScreenWithChromeProps = Omit<
  ScreenProps,
  'title' | 'showBack' | 'backIcon' | 'headerActions' | 'isSearchActive'
> & {
  chrome: ScreenChrome;
};

export function ScreenWithChrome({
  chrome,
  children,
  onBack,
  headerStyle,
  ...rest
}: ScreenWithChromeProps) {
  const fab = chrome.fab;

  return (
    <Screen
      {...rest}
      title={chrome.screenTitle}
      showBack={chrome.showBack ?? false}
      backIcon={chrome.backIcon}
      headerActions={chrome.headerActions}
      isSearchActive={chrome.isSearchActive}
      onBack={chrome.onBack ?? onBack}
      headerStyle={chrome.headerStyle ?? headerStyle}
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
