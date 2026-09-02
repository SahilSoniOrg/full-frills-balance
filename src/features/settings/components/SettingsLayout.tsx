import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import type {
  NavBackIcon,
  ScreenChrome,
  ScreenFabChrome,
} from '@/src/components/layout/screenChrome';
import { Inset, Stack } from '@/src/design-system';
import { SettingsFooter } from '@/src/features/settings/components/SettingsFooter';
import { SettingsFocusProvider } from '@/src/features/settings/components/SettingsFocusTarget';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import React, { useRef } from 'react';
import type { ScrollViewProps } from 'react-native';
import type { ScrollView } from 'react-native-gesture-handler';
import type { Edge } from 'react-native-safe-area-context';

interface SettingsLayoutProps {
  title: string;
  headerActions?: React.ReactNode;
  fab?: ScreenFabChrome;
  /** Tab root: false. Sub-screens: true (default). */
  showBack?: boolean;
  backIcon?: NavBackIcon;
  scrollable?: boolean;
  children: React.ReactNode;
  edges?: Edge[];
  hideFooter?: boolean;
  scrollViewProps?: ScrollViewProps;
}

/**
 * Settings shell: builds default nav chrome from title + optional actions/FAB.
 */
export function SettingsLayout({
  title,
  headerActions,
  fab,
  showBack = true,
  backIcon = 'back',
  scrollable = true,
  children,
  edges,
  hideFooter = false,
  scrollViewProps,
}: SettingsLayoutProps) {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const chrome: ScreenChrome = showBack
    ? {
        screenTitle: title,
        showBack: true,
        backIcon,
        onBack: AppNavigation.back,
        headerActions,
        fab,
      }
    : { screenTitle: title, showBack: false, headerActions, fab };

  return (
    <SettingsFocusProvider
      targetId={focus}
      scrollViewRef={scrollViewRef}
      scrollOffsetRef={scrollOffsetRef}
    >
      <ScreenWithChrome
        chrome={chrome}
        scrollable={scrollable}
        edges={edges}
        scrollViewProps={{
          ...scrollViewProps,
          onScroll: event => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
            scrollViewProps?.onScroll?.(event);
          },
          scrollEventThrottle: scrollViewProps?.scrollEventThrottle ?? 16,
        }}
        scrollViewRef={scrollViewRef}
      >
        <Inset space="md" vertical="md" flex={scrollable ? undefined : 1}>
          <Stack space="xl" flex={scrollable ? undefined : 1}>
            {children}
            {!hideFooter && <SettingsFooter />}
          </Stack>
        </Inset>
      </ScreenWithChrome>
    </SettingsFocusProvider>
  );
}
