import { NavigationBar, type NavigationBarLeft } from '@/src/components/layout/NavigationBar';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Page } from '@/src/design-system';
import React from 'react';
import { ScrollViewProps, StyleSheet, View, type ViewProps } from 'react-native';
import type { ScrollView } from 'react-native-gesture-handler';
import { type Edge } from 'react-native-safe-area-context';

export type { NavigationBarLeft };

export type ScreenProps = ViewProps & {
  children: React.ReactNode;
  // Navigation
  title?: string;
  subtitle?: string;
  /** Explicit left header slot: back or leading (e.g. drawer). Omit for neither. */
  left?: NavigationBarLeft;
  headerActions?: React.ReactNode;
  isSearchActive?: boolean;
  // Layout
  overlay?: React.ReactNode;
  scrollable?: boolean;
  withPadding?: boolean;
  edges?: Edge[];
  keyboardAvoiding?: boolean;
  footer?: React.ReactNode;
  scrollViewProps?: ScrollViewProps;
  scrollViewRef?: React.Ref<ScrollView>;
};

export function Screen({
  children,
  overlay,
  title,
  subtitle,
  left,
  headerActions,
  isSearchActive = false,
  scrollable = false,
  withPadding = false,
  edges = ['top', 'bottom'],
  keyboardAvoiding = false,
  footer,
  scrollViewProps,
  scrollViewRef,
  style,
  ...rest
}: ScreenProps) {
  const { themeMode } = useTheme();

  const content = (
    <View style={[styles.content, withPadding && styles.padded, style]}>{children}</View>
  );

  const headerCovered = Boolean(overlay);
  const navigationBar =
    left || title || headerActions ? (
      <View
        style={headerCovered ? styles.coveredHeader : undefined}
        pointerEvents={headerCovered ? 'none' : 'auto'}
        accessibilityElementsHidden={headerCovered}
        importantForAccessibility={headerCovered ? 'no-hide-descendants' : 'auto'}
      >
        <NavigationBar
          title={title || ''}
          subtitle={subtitle}
          left={left}
          rightActions={headerActions}
          isSearchActive={isSearchActive}
        />
      </View>
    ) : undefined;

  return (
    <Page
      background="background"
      edges={edges}
      scrollable={scrollable}
      statusBar={themeMode === 'dark' ? 'light' : 'dark'}
      keyboardAvoiding={keyboardAvoiding}
      footer={footer}
      header={navigationBar}
      overlay={overlay}
      scrollViewProps={scrollViewProps}
      scrollViewRef={scrollViewRef}
      {...rest}
    >
      {content}
    </Page>
  );
}

const styles = StyleSheet.create({
  coveredHeader: { opacity: 0 },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.lg,
  },
});
