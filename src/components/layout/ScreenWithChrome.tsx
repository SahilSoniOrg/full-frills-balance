import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout/Screen';
import type { ScreenProps } from '@/src/components/layout/Screen';
import type { NavBackIcon, ScreenChrome } from '@/src/components/layout/screenChrome';
import type { NavigationBarLeft } from '@/src/components/layout/NavigationBar';
import { PrimaryNavigationHeader } from '@/src/navigation/PrimaryNavigationHeader';
import {
  PRIMARY_NAVIGATION_TRIGGER_SIZE,
  usePrimaryNavigation,
} from '@/src/navigation/primaryNavigation';
import { StyleSheet, View } from 'react-native';
import { usePublishTabChrome } from './PersistentTabChrome';
import { useRouteBackIcon } from '@/src/navigation/RoutePresentationContext';

type ScreenWithChromeProps = Omit<
  ScreenProps,
  'title' | 'left' | 'overlay' | 'selection' | 'headerActions' | 'isSearchActive'
> & {
  chrome: ScreenChrome;
};

function leftFromChrome(
  chrome: ScreenChrome,
  isPrimaryTabRoot: boolean,
  routeBackIcon: NavBackIcon,
): NavigationBarLeft | undefined {
  if (chrome.kind === 'nav') {
    return {
      kind: 'back',
      onPress: chrome.onBack,
      icon: chrome.backIcon ?? routeBackIcon,
    };
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

/** Retained leaves publish their chrome to the pager. Other screens render it locally. */
export function ScreenWithChrome({ chrome, children, ...rest }: ScreenWithChromeProps) {
  const navigation = usePrimaryNavigation();
  const leafRoute = usePublishTabChrome(chrome.kind === 'tab' ? chrome : null);
  const isPrimaryTabRoot = !!navigation && chrome.kind === 'tab';
  const routeBackIcon = useRouteBackIcon();

  const edges: ScreenProps['edges'] =
    rest.edges ?? (chrome.kind === 'nav' ? ['top', 'bottom'] : ['top']);
  const fab = chrome.kind === 'nav' && !chrome.selection ? chrome.fab : undefined;

  return (
    <Screen
      {...rest}
      edges={leafRoute ? edges.filter(edge => edge !== 'top') : edges}
      title={leafRoute ? undefined : chrome.screenTitle}
      left={leafRoute ? undefined : leftFromChrome(chrome, isPrimaryTabRoot, routeBackIcon)}
      selection={!leafRoute ? chrome.selection : undefined}
      headerActions={leafRoute ? undefined : chrome.headerActions}
      isSearchActive={chrome.isSearchActive}
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
