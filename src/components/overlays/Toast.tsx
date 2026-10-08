import { useState, useEffect } from 'react';
import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { AppConfig } from '@/src/constants';
import { Size, Spacing, ZIndex, Typography, type Theme } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { ToastItem, useToastListener } from '@/src/hooks/useToastListener';
import { ToastPayload } from '@/src/utils/alerts';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { Animated, PanResponder, StyleSheet, View, TouchableOpacity } from 'react-native';

export function ToastContainer() {
  const { toasts } = useToastListener();

  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map(toast => (
        <ToastItemView key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

function ToastItemView({ toast }: { toast: ToastItem }) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [animatedValue] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      animatedValue.setValue(1);
      opacity.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: AppConfig.toast.animationDurationMs,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: AppConfig.toast.animationDurationMs,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animatedValue, opacity, reduceMotion]);

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-AppConfig.toast.enterOffsetY, 0],
  });

  const colors = getToastColors(toast.type, theme);
  const icon = getToastIcon(toast.type);
  const dismissGesture = toast.dismissible
    ? PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => gestureState.dy < -10,
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dy < -40) toast.dismiss();
        },
      })
    : null;

  return (
    <Animated.View
      {...(dismissGesture?.panHandlers ?? {})}
      testID="app-toast"
      style={[
        styles.toastWrapper,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={[styles.toast, { backgroundColor: colors.background }]}>
        <View style={styles.contentContainer}>
          <AppIcon name={icon} size={Size.iconSm} color={colors.icon} />
          <AppText variant="body" style={[styles.message, { color: colors.text }]}>
            {toast.message}
          </AppText>
        </View>

        {toast.action && (
          <TouchableOpacity
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            onPress={() => {
              toast.action?.onPress();
            }}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <AppText
              variant="body"
              weight="bold"
              style={[styles.actionText, { color: colors.text }]}
            >
              {toast.action.label.toUpperCase()}
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

function getToastColors(type: ToastPayload['type'], theme: Theme) {
  switch (type) {
    case 'success':
      return {
        background: theme.successLight || theme.success,
        icon: theme.success,
        text: theme.success,
      };
    case 'error':
      return {
        background: theme.errorLight || theme.error,
        icon: theme.error,
        text: theme.error,
      };
    case 'warning':
      return {
        background: theme.warningLight || theme.warning,
        icon: theme.warning,
        text: theme.warning,
      };
    case 'info':
    default:
      return {
        background: theme.primaryLight || theme.primary,
        icon: theme.primary,
        text: theme.primary,
      };
  }
}

function getToastIcon(type: ToastPayload['type']): IconName {
  switch (type) {
    case 'success':
      return Icon.CheckCircle;
    case 'error':
      return Icon.Error;
    case 'warning':
      return Icon.Alert;
    case 'info':
    default:
      return Icon.HelpCircle;
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: AppConfig.layout.toastTopOffset,
    left: 0,
    right: 0,
    zIndex: ZIndex.toast,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  toastWrapper: {
    width: '100%',
    maxWidth: 400,
    marginBottom: Spacing.sm,
  },
  toast: {
    alignItems: 'stretch',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    gap: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    minHeight: 48,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  message: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  actionButton: {
    alignSelf: 'flex-end',
    minHeight: 48,
    justifyContent: 'center',
    maxWidth: '100%',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  actionText: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 0.5,
    textAlign: 'right',
  },
});
