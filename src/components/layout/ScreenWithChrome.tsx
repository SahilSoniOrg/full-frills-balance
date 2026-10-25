import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout/Screen';
import type { ScreenProps } from '@/src/components/layout/Screen';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';
import type { NavigationBarLeft } from '@/src/components/layout/NavigationBar';
import { PrimaryNavigationHeader } from '@/src/navigation/PrimaryNavigationHeader';
import {
  PRIMARY_NAVIGATION_TRIGGER_SIZE,
  usePrimaryNavigation,
} from '@/src/navigation/primaryNavigation';
import { useIsFocused } from 'expo-router';
import { useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';

type ScreenWithChromeProps = Omit<
  ScreenProps,
  'title' | 'left' | 'headerActions' | 'isSearchActive' | 'headerStyle'
> & {
  chrome: ScreenChrome;
};

function leftFromChrome(
  chrome: ScreenChrome,
  isPrimaryTabRoot: boolean,
): NavigationBarLeft | undefined {
  if (chrome.kind === 'nav') {
    return { kind: 'back', onPress: chrome.onBack, icon: chrome.backIcon };
  }
  if (chrome.kind === 'tab' && isPrimaryTabRoot) {
    return {
      kind: 'leading',
      content: (
        <View style={styles.primaryHeaderSlot}>
          <PrimaryNavigationHeader />
        </View>
      ),
    };
  }
  return undefined;
}

/** Renders Screen chrome. Left slot / header style / FAB come only from `chrome`. */
export function ScreenWithChrome({ chrome, children, ...rest }: ScreenWithChromeProps) {
  const navigation = usePrimaryNavigation();
  const isFocused = useIsFocused();
  const isPrimaryTabRoot = !!navigation && chrome.kind === 'tab';
  const reportSelectionMode = navigation?.reportSelectionMode;

  useLayoutEffect(() => {
    if (isPrimaryTabRoot && isFocused) {
      reportSelectionMode?.(chrome.selectionMode ?? false);
    }
  }, [chrome.selectionMode, isFocused, isPrimaryTabRoot, reportSelectionMode]);

  const edges: ScreenProps['edges'] =
    rest.edges ?? (chrome.kind === 'nav' ? ['top', 'bottom'] : ['top']);
  const fab = chrome.kind === 'nav' ? chrome.fab : undefined;

  return (
    <Screen
      {...rest}
      edges={edges}
      title={chrome.screenTitle}
      left={leftFromChrome(chrome, isPrimaryTabRoot)}
      headerActions={chrome.headerActions}
      isSearchActive={chrome.isSearchActive}
      headerStyle={chrome.headerStyle}
    >
      {children}
      {fab ? <FloatingActionButton {...fab} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  primaryHeaderSlot: {
    width: PRIMARY_NAVIGATION_TRIGGER_SIZE,
    height: PRIMARY_NAVIGATION_TRIGGER_SIZE,
  },
});
