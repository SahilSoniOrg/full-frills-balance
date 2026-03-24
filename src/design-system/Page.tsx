import { SpacingKey, Theme } from '@/src/constants/design-tokens'
import { useTheme } from '@/src/hooks/use-theme'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import {
  Platform,
  ScrollViewProps,
  StyleSheet,
  View,
  ViewProps,
} from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { Edge, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Box } from './Box'
import { useKeyboard } from './Keyboard'

export type PageProps = ViewProps & {
  children: React.ReactNode
  background?: keyof Theme | string
  safeArea?: boolean
  edges?: Edge[]
  scrollable?: boolean
  keyboardAvoiding?: boolean
  padding?: SpacingKey
  paddingX?: SpacingKey
  paddingY?: SpacingKey
  header?: React.ReactNode
  footer?: React.ReactNode
  scrollViewProps?: ScrollViewProps
  statusBar?: 'light' | 'dark' | 'auto'
  keyboardVerticalOffset?: number
}

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
  const { theme, themeMode } = useTheme()

  const resolvedStatusBar = statusBar === 'auto'
    ? (themeMode === 'dark' ? 'light' : 'dark')
    : statusBar

  const insets = useSafeAreaInsets()
  const { keyboardHeight } = useKeyboard()

  const keyboardOffset = React.useMemo(() => {
    if (!keyboardAvoiding || keyboardHeight === 0) return 0

    if (Platform.OS === 'ios') {
      // On iOS, the keyboard height includes the bottom safe area inset.
      // We subtract it to avoid over-padding the footer.
      return Math.max(0, keyboardHeight - insets.bottom)
    }

    // On Android, the height usually doesn't include insets or is handled differently.
    // Given the clipping, we should use the full reported height or slightly more.
    return keyboardHeight
  }, [keyboardAvoiding, keyboardHeight, insets.bottom])

  const Container = React.useMemo(() => (safeArea ? SafeAreaView : View), [safeArea])

  const backgroundColor = React.useMemo(() => {
    return background in theme ? theme[background as keyof Theme] : background
  }, [background, theme])

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
  )

  const wrappedContent = scrollable ? (
    <ScrollView
      {...scrollViewProps}
      style={[styles.scrollView, scrollViewProps?.style]}
      contentContainerStyle={[
        styles.scrollContent,
        scrollViewProps?.contentContainerStyle,
      ]}
    >
      {content}
    </ScrollView>
  ) : (
    content
  )

  return (
    // @ts-ignore
    <Container
      edges={edges}
      style={[
        styles.container,
        { backgroundColor },
      ]}
    >
      <StatusBar style={resolvedStatusBar as 'light' | 'dark' | 'auto'} />
      {header}
      <Box flex={1}>
        {wrappedContent}
      </Box>
      <Box style={{ paddingBottom: keyboardOffset }}>
        {footer}
      </Box>
    </Container>
  )
}

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
})
