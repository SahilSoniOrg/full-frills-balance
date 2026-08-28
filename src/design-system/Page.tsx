import { Spacing, SpacingKey, Theme } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollViewProps, StyleSheet, View, ViewProps } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { Box } from './Box';
import { KeyboardAvoidingView } from './Keyboard';

export type PageProps = ViewProps & {
  children: React.ReactNode;
  background?: keyof Theme | string;
  safeArea?: boolean;
  edges?: Edge[];
  scrollable?: boolean;
  keyboardAvoiding?: boolean;
  padding?: SpacingKey;
  paddingX?: SpacingKey;
  paddingY?: SpacingKey;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  scrollViewProps?: ScrollViewProps;
  statusBar?: 'light' | 'dark' | 'auto';
  keyboardVerticalOffset?: number;
};

interface ContainerProps extends ViewProps {
  safeArea: boolean;
  edges: Edge[];
  children: React.ReactNode;
}

// Safer polymorphic container that avoids prop leakage
const Container = ({ safeArea, edges, children, ...props }: ContainerProps) => {
  if (safeArea) {
    return (
      <SafeAreaView edges={edges} {...props}>
        {children}
      </SafeAreaView>
    );
  }
  return <View {...props}>{children}</View>;
};

export const Page = ({
  children,
  background = 'background',
  safeArea = true,
  edges = ['top', 'bottom', 'left', 'right'],
  scrollable = false,
  keyboardAvoiding = false,
  padding,
  paddingX,
  paddingY,
  header,
  footer,
  scrollViewProps,
  statusBar = 'auto',
  keyboardVerticalOffset,
  style,
  ...props
}: PageProps) => {
  const { theme, themeMode } = useTheme();

  const resolvedStatusBar =
    statusBar === 'auto' ? (themeMode === 'dark' ? 'light' : 'dark') : statusBar;

  const backgroundColor = React.useMemo(() => {
    return background in theme ? theme[background as keyof Theme] : background;
  }, [background, theme]);

  const content = (
    <Box
      flex={1}
      padding={padding}
      paddingHorizontal={paddingX}
      paddingVertical={paddingY}
      style={style}
      {...props}
    >
      {children}
    </Box>
  );

  const wrappedContent = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      {...scrollViewProps}
      style={[styles.scrollView, scrollViewProps?.style]}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: Spacing.xxl },
        scrollViewProps?.contentContainerStyle,
      ]}
    >
      {content}
    </ScrollView>
  ) : (
    content
  );

  const pageBody = (
    <>
      <Box flex={1}>{wrappedContent}</Box>
      <Box>{footer}</Box>
    </>
  );

  return (
    <Container safeArea={safeArea} edges={edges} style={[styles.container, { backgroundColor }]}>
      <StatusBar style={resolvedStatusBar as 'light' | 'dark' | 'auto'} />
      {header}
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          keyboardVerticalOffset={keyboardVerticalOffset}
          style={styles.keyboardContainer}
        >
          {pageBody}
        </KeyboardAvoidingView>
      ) : (
        pageBody
      )}
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
});
