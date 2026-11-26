import { NavigationBar, type NavigationBarLeft } from '@/src/components/layout/NavigationBar';
import { coveredInteractionProps } from '@/src/components/shared/coveredInteractionProps';
import {
  SelectionDock,
  SelectionHeader,
  type SelectionOverlayProps,
} from '@/src/components/shared/SelectionOverlay';
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
  overlay,
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

  const headerCovered = Boolean(overlay || selection);
  const navigationBar =
    left || title || headerActions ? (
      <View
        style={[
          headerCovered ? styles.coveredHeader : undefined,
          selection ? styles.coveredHeaderLayer : undefined,
        ]}
        {...coveredInteractionProps(headerCovered)}
      >
        <NavigationBar
          title={title || ''}
          subtitle={subtitle}
          left={left}
          rightActions={headerActions}
          isSearchActive={isSearchActive}
          covered={headerCovered}
        />
      </View>
    ) : undefined;

  const header =
    navigationBar || selection ? (
      <View
        style={
          selection
            ? [styles.selectionHeaderHost, { backgroundColor: theme.background }]
            : undefined
        }
      >
        {navigationBar}
        {selection ? <SelectionHeader {...selection} /> : null}
      </View>
    ) : undefined;

  const selectionFooter = selection ? (
    <View style={[styles.selectionFooterHost, { backgroundColor: theme.background }]}>
      <SelectionDock {...selection} />
    </View>
  ) : undefined;

  const resolvedFooter =
    selectionFooter && footer ? (
      <>
        {footer}
        {selectionFooter}
      </>
    ) : (
      (selectionFooter ?? footer)
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
  coveredHeaderLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  selectionHeaderHost: {
    zIndex: 1,
  },
  selectionFooterHost: {
    zIndex: 1,
  },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.lg,
  },
});
