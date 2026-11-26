import { AppButton } from '@/src/components/core';
import type { AppButtonProps } from '@/src/components/core/AppButton';
import { Shape, Size, Spacing } from '@/src/constants';
import { createContext, useContext } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

export type ModalActionsLayout = 'inline' | 'primary' | 'stacked';

/** ModalSurface supplies the presentation, including actions rendered inside its body. */
export const ModalActionsSurfaceContext = createContext<'center' | 'bottomSheet'>('center');

export interface ModalAction {
  label: string;
  onPress: () => void;
  role?: 'primary' | 'secondary';
  variant?: AppButtonProps['variant'];
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

const isDestructive = (action: ModalAction) =>
  action.variant === 'destructive' || action.variant === 'destructive-outline';

/**
 * Picks a footer shape when the caller does not name one.
 * Sheets anchor actions across their width; short dialogs keep a compact row.
 * A destructive primary stays separate from its dismissal action.
 */
function defaultLayout(
  actions: ModalAction[],
  surface: 'center' | 'bottomSheet',
): ModalActionsLayout {
  const hasSecondary = actions.some(action => action.role === 'secondary');
  const hasPrimary = actions.some(action => action.role !== 'secondary');
  const hasDestructivePrimary = actions.some(
    action => action.role !== 'secondary' && isDestructive(action),
  );
  if (hasSecondary && hasDestructivePrimary) return 'primary';
  if (surface === 'bottomSheet') {
    return actions.length === 2 && hasSecondary && hasPrimary ? 'primary' : 'stacked';
  }
  return actions.length > 2 ? 'stacked' : 'inline';
}

/** Shared action footer for app-owned modal surfaces. */
export function ModalActions({
  actions,
  layout,
}: {
  actions: ModalAction[];
  layout?: ModalActionsLayout;
}) {
  const { fontScale } = useWindowDimensions();
  const surface = useContext(ModalActionsSurfaceContext);
  const preferredLayout = layout ?? defaultLayout(actions, surface);
  const resolvedLayout: ModalActionsLayout =
    fontScale > 1.3 && preferredLayout === 'inline' ? 'stacked' : preferredLayout;

  const primaryActions = actions.filter(action => action.role !== 'secondary');
  const secondaryActions = actions.filter(action => action.role === 'secondary');
  const isBottomSheet = surface === 'bottomSheet';

  // The visible surface fills the platform-sized target, including Android's 48pt minimum.
  const minimumHeight = Platform.OS === 'android' ? Size.touchTargetLg : Size.touchTarget;

  const renderAction = (
    action: ModalAction,
    keyPrefix: string,
    index: number,
    width: 'content' | 'full',
  ) => {
    const secondary = action.role === 'secondary';
    const variant = action.variant ?? (secondary ? 'ghost' : 'primary');

    return (
      <AppButton
        key={`${keyPrefix}-${action.testID ?? action.label}-${index}`}
        variant={variant}
        size={isBottomSheet ? 'md' : 'sm'}
        onPress={action.onPress}
        disabled={action.disabled}
        loading={action.loading}
        accessibilityLabel={action.accessibilityLabel ?? action.label}
        testID={action.testID}
        style={[
          width === 'full' && styles.fullWidth,
          width === 'content' && styles.inlineButton,
          styles.hitTarget,
          { minHeight: minimumHeight },
        ]}
        buttonStyle={[
          styles.buttonSurface,
          { minHeight: isBottomSheet ? Size.buttonLg : minimumHeight },
        ]}
      >
        {action.label}
      </AppButton>
    );
  };

  if (resolvedLayout === 'primary') {
    return (
      <View style={styles.primaryGroup}>
        {primaryActions.map((action, index) => renderAction(action, 'primary', index, 'full'))}
        {secondaryActions.map((action, index) => (
          <View
            key={`secondary-${action.testID ?? action.label}-${index}`}
            style={styles.dismissRow}
          >
            {renderAction(action, 'secondary', index, 'content')}
          </View>
        ))}
      </View>
    );
  }

  const orderedActions =
    resolvedLayout === 'stacked' && secondaryActions.length > 0 && primaryActions.length > 0
      ? [...primaryActions, ...secondaryActions]
      : actions;

  return (
    <View
      style={[
        styles.actions,
        resolvedLayout === 'inline' && styles.inline,
        resolvedLayout === 'stacked' && styles.stacked,
      ]}
    >
      {orderedActions.map((action, index) =>
        renderAction(
          action,
          action.role === 'secondary' ? 'secondary' : 'primary',
          index,
          resolvedLayout === 'inline' ? 'content' : 'full',
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    width: '100%',
    gap: Spacing.sm,
  },
  inline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  stacked: {
    flexDirection: 'column',
  },
  primaryGroup: {
    width: '100%',
    gap: Spacing.xs,
  },
  dismissRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineButton: {
    maxWidth: '100%',
    flexShrink: 1,
  },
  fullWidth: {
    width: '100%',
  },
  hitTarget: {
    justifyContent: 'center',
  },
  buttonSurface: {
    borderRadius: Shape.radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});
