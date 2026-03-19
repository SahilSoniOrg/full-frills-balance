import { NavigationBar, type NavigationBarProps } from '@/src/components/layout/NavigationBar'
import { Spacing } from '@/src/constants'
import { useTheme } from '@/src/hooks/use-theme'
import { Page } from '@/src/design-system'
import React from 'react'
import { ScrollViewProps, StyleSheet, View, type ViewProps } from 'react-native'
import { type Edge } from 'react-native-safe-area-context'

export type ScreenProps = ViewProps & {
  children: React.ReactNode
  // Navigation
  title?: string
  subtitle?: string
  onBack?: () => void
  showBack?: boolean
  backIcon?: NavigationBarProps['backIcon']
  headerActions?: React.ReactNode
  isSearchActive?: boolean
  alignTitle?: NavigationBarProps['alignTitle']
  // Layout
  scrollable?: boolean
  withPadding?: boolean
  edges?: Edge[]
  keyboardAvoiding?: boolean
  footer?: React.ReactNode
  scrollViewProps?: ScrollViewProps
}

export function Screen({
  children,
  title,
  subtitle,
  onBack,
  showBack,
  backIcon,
  headerActions,
  isSearchActive = false,
  alignTitle,
  scrollable = false,
  withPadding = false,
  edges = ['top'],
  keyboardAvoiding = false,
  footer,
  scrollViewProps,
  style,
  ...rest
}: ScreenProps) {
  const { themeMode } = useTheme()

  // Clean props for SafeAreaView to avoid Web DOM warnings
  // @ts-ignore
  const { scrollable: _s, withPadding: _w, ...safeAreaProps } = rest;

  const content = (
    <View style={[
      styles.content,
      withPadding && styles.padded,
      style
    ]}>
      {children}
    </View>
  )

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
          alignTitle={alignTitle}
        />
      )}
      {content}
    </Page>
  )
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
})
