/**
 * NavigationBar - App-specific navigation header.
 *
 * The left slot is an explicit choice — never two competing props:
 * - `back` → back/close control, centered title
 * - `leading` → leading control (drawer trigger) + inline title + actions
 * - omitted → left-aligned title, no leading control
 */

import { Icon, AppText, IconButton } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

export type NavigationBarLeft =
  | {
      kind: 'back';
      onPress: () => void;
      icon?: typeof Icon.Back | typeof Icon.Close;
    }
  | { kind: 'leading'; content: React.ReactNode };

export type NavigationBarProps = {
  title: string;
  subtitle?: string;
  /** Omit for no left control. */
  left?: NavigationBarLeft;
  rightActions?: React.ReactNode;
  isSearchActive?: boolean;
  style?: ViewStyle;
};

export function NavigationBar({
  title,
  subtitle,
  left,
  rightActions,
  isSearchActive = false,
  style,
}: NavigationBarProps) {
  if (left?.kind === 'leading') {
    return (
      <View style={[styles.container, styles.leadingContainer, style]}>
        <View style={styles.leadingRow}>
          <View style={styles.leadingLead}>
            {left.content}
            {!isSearchActive && title ? (
              <AppText
                variant="heading"
                fontRole="display"
                style={styles.leadingTitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {title}
              </AppText>
            ) : null}
          </View>
          <View style={styles.leadingActions}>{rightActions}</View>
        </View>
      </View>
    );
  }

  const showBack = left?.kind === 'back';

  return (
    <View style={[styles.container, style]}>
      {showBack ? (
        <View style={[styles.side, styles.left]}>
          {!isSearchActive ? (
            <IconButton
              name={left.icon ?? Icon.Back}
              onPress={left.onPress}
              variant="surface"
              testID="nav-back-button"
            />
          ) : null}
        </View>
      ) : null}

      {!isSearchActive ? (
        <View style={[styles.center, !showBack && styles.centerLeft]}>
          <AppText
            variant={showBack ? 'heading' : 'xl'}
            fontRole="display"
            style={[styles.title, !showBack && styles.titleLeft]}
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
    minHeight: 64,
  },
  leadingContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  leadingRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  leadingLead: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  leadingTitle: { flex: 1, minWidth: 0 },
  leadingActions: {
    flexDirection: 'row',
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.xs,
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
