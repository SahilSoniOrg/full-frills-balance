import { NavigationBar, type NavigationBarProps } from '@/src/components/layout/NavigationBar';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Page } from '@/src/design-system';
import React from 'react';
import { ScrollViewProps, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { type Edge } from 'react-native-safe-area-context';

export type ScreenProps = ViewProps & {
  children: React.ReactNode;
  // Navigation
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  backIcon?: NavigationBarProps['backIcon'];
  headerActions?: React.ReactNode;
  isSearchActive?: boolean;
  // Layout
  scrollable?: boolean;
  withPadding?: boolean;
  edges?: Edge[];
  keyboardAvoiding?: boolean;
  footer?: React.ReactNode;
  scrollViewProps?: ScrollViewProps;
  headerStyle?: ViewStyle;
};

export function Screen({
  children,
  title,
  subtitle,
  onBack,
  showBack,
  backIcon,
  headerActions,
  isSearchActive = false,
  scrollable = false,
  withPadding = false,
  edges = ['top'],
  keyboardAvoiding = false,
  footer,
  scrollViewProps,
  headerStyle,
  style,
  ...rest
}: ScreenProps) {
  const { themeMode } = useTheme();

  const content = (
    <View style={[styles.content, withPadding && styles.padded, style]}>{children}</View>
  );

  return (
    <Page
      background="background"
      edges={edges}
      scrollable={scrollable}
      statusBar={themeMode === 'dark' ? 'light' : 'dark'}
      keyboardAvoiding={keyboardAvoiding}
      footer={footer}
      scrollViewProps={scrollViewProps}
      {...rest}
    >
      {(title || headerActions) && (
        <NavigationBar
          title={title || ''}
          subtitle={subtitle}
          onBack={onBack}
          showBack={showBack}
          backIcon={backIcon}
          rightActions={headerActions}
          isSearchActive={isSearchActive}
          style={headerStyle}
        />
      )}
      {content}
    </Page>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
