import { NavigationBar, type NavigationBarProps } from '@/src/components/layout/NavigationBar';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Page } from '@/src/design-system';
import React from 'react';
import { ScrollViewProps, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import type { ScrollView } from 'react-native-gesture-handler';
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
  scrollViewRef?: React.Ref<ScrollView>;
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
  edges = ['top', 'bottom'],
  keyboardAvoiding = false,
  footer,
  scrollViewProps,
  scrollViewRef,
  headerStyle,
  style,
  ...rest
}: ScreenProps) {
  const { themeMode } = useTheme();

  const content = (
    <View style={[styles.content, withPadding && styles.padded, style]}>{children}</View>
  );

  const navigationBar =
    title || headerActions ? (
      <NavigationBar
        title={title || ''}
        subtitle={subtitle}
        backIcon={backIcon}
        rightActions={headerActions}
        isSearchActive={isSearchActive}
        style={headerStyle}
        {...(showBack && onBack
          ? { showBack: true as const, onBack }
          : { showBack: false as const })}
      />
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
