/**
 * NavigationBar - App-specific navigation header
 * Provides consistent title, back button and actions across screens
 */

import { AppText, IconButton } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { AppNavigation } from '@/src/utils/navigation';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

export type NavigationBarProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  backIcon?: 'back' | 'close';
  rightActions?: React.ReactNode;
  isSearchActive?: boolean;
  alignTitle?: 'center' | 'left';
  style?: ViewStyle;
};

export function NavigationBar({
  title,
  subtitle,
  onBack,
  showBack = true,
  backIcon = 'back',
  rightActions,
  isSearchActive = false,
  alignTitle = 'center',
  style,
}: NavigationBarProps) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      AppNavigation.back();
    }
  };

  const showLeftSlot = showBack || alignTitle === 'center';

  return (
    <View style={[styles.container, style]}>
      {showLeftSlot ? (
        <View style={[styles.side, styles.left, !showBack && styles.sideSpacer]}>
          {showBack && !isSearchActive ? (
            <IconButton
              name={backIcon}
              onPress={handleBack}
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
          !rightActions && alignTitle === 'center' && styles.sideSpacer,
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
