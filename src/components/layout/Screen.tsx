/**
 * Screen - App-specific layout primitive
 * Provides consistent screen layout with safe area, background, and navigation
 */

import { NavigationBar, type NavigationBarProps } from '@/src/components/layout/NavigationBar'
import { Spacing } from '@/src/constants'
import { useTheme } from '@/src/hooks/use-theme'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'

export type ScreenProps = ViewProps & {
  children: React.ReactNode
  // Navigation
  title?: string
  subtitle?: string
  onBack?: () => void
  showBack?: boolean
  backIcon?: NavigationBarProps['backIcon']
  headerActions?: React.ReactNode
  // Layout
  scrollable?: boolean
  withPadding?: boolean
  edges?: Edge[]
}

export function Screen({
  children,
  title,
  subtitle,
  onBack,
  showBack,
  backIcon,
  headerActions,
  scrollable = false,
  withPadding = false,
  edges = ['top'],
  style,
  ...rest
}: ScreenProps) {
  const { theme, themeMode } = useTheme()

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
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={edges}
      {...safeAreaProps}
    >
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />

      {title && (
        <NavigationBar
          title={title}
          subtitle={subtitle}
          onBack={onBack}
          showBack={showBack}
          backIcon={backIcon}
          rightActions={headerActions}
        />
      )}

      {scrollable ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
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
