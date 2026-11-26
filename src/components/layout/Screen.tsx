import { NavigationBar, type NavigationBarLeft } from '@/src/components/layout/NavigationBar';
import {
  SelectionFooterHost,
  SelectionHeaderHost,
} from '@/src/components/shared/SelectionChromeHost';
import type { SelectionOverlayProps } from '@/src/components/shared/SelectionOverlay';
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
  selection?: SelectionOverlayProps;
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
  selection,
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
  const { theme, themeMode } = useTheme();

  const content = (
    <View style={[styles.content, withPadding && styles.padded, style]}>{children}</View>
  );

  const navigationBar =
    left || title || headerActions ? (
      <NavigationBar
        title={title || ''}
        subtitle={subtitle}
        left={left}
        rightActions={headerActions}
        isSearchActive={isSearchActive}
        covered={Boolean(selection)}
      />
    ) : undefined;

  const header = (
    <SelectionHeaderHost selection={selection} backgroundColor={theme.background}>
      {navigationBar}
    </SelectionHeaderHost>
  );

  const resolvedFooter = (
    <SelectionFooterHost selection={selection} backgroundColor={theme.background}>
      {footer}
    </SelectionFooterHost>
  );

  return (
    <Page
      background="background"
      edges={edges}
      scrollable={scrollable}
      statusBar={themeMode === 'dark' ? 'light' : 'dark'}
      keyboardAvoiding={keyboardAvoiding}
      footer={resolvedFooter}
      header={header}
      scrollViewProps={scrollViewProps}
      scrollViewRef={scrollViewRef}
      {...rest}
    >
      {content}
    </Page>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.lg,
  },
});
