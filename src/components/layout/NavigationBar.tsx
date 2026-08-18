/**
 * NavigationBar - App-specific navigation header
 * Provides consistent title, back button and actions across screens
 *
 * Title alignment is derived, not chosen per screen:
 * - showBack → centered (stack / pushed routes)
 * - no back → left (tab roots)
 */

import { AppText, IconButton } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

type NavigationBarShared = {
  title: string;
  subtitle?: string;
  backIcon?: 'back' | 'close';
  rightActions?: React.ReactNode;
  isSearchActive?: boolean;
  style?: ViewStyle;
};

export type NavigationBarProps = NavigationBarShared &
  ({ showBack: true; onBack: () => void } | { showBack?: false; onBack?: undefined });

export function NavigationBar({
  title,
  subtitle,
  onBack,
  showBack = false,
  backIcon = 'back',
  rightActions,
  isSearchActive = false,
  style,
}: NavigationBarProps) {
  const alignTitle = showBack ? 'center' : 'left';

  return (
    <View style={[styles.container, style]}>
      {showBack ? (
        <View style={[styles.side, styles.left]}>
          {!isSearchActive ? (
            <IconButton
              name={backIcon}
              onPress={onBack}
              variant="surface"
              style={styles.backButton}
              testID="nav-back-button"
            />
          ) : null}
        </View>
      ) : null}

      {!isSearchActive ? (
        <View style={[styles.center, alignTitle === 'left' && styles.centerLeft]}>
          <AppText
            variant="subheading"
            style={[styles.title, alignTitle === 'left' && styles.titleLeft]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText
              variant="caption"
              color="secondary"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.subtitle}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.side,
          styles.right,
          isSearchActive && styles.rightSearchActive,
          showBack && !rightActions && styles.sideSpacer,
        ]}
      >
        {rightActions}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    height: 64,
  },
  side: {
    flexShrink: 0,
    justifyContent: 'center',
  },
  /** Optical balance for centered titles (matches back-button / actions column). */
  sideSpacer: {
    width: 48,
  },
  left: {
    alignItems: 'flex-start',
    minWidth: 48,
  },
  center: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  centerLeft: {
    paddingLeft: 0,
  },
  right: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rightSearchActive: {
    flex: 1,
    minWidth: 0,
  },
  backButton: {
    // IconButton defaults are good
  },
  title: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  titleLeft: {
    textAlign: 'left',
  },
  subtitle: {
    alignSelf: 'stretch',
  },
});
