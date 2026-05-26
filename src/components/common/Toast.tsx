import { useState, useEffect } from 'react';
import { AppIcon, IconName } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { AppConfig } from '@/src/constants';
import { Size, Spacing, ZIndex, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { ToastItem, useToastListener } from '@/src/hooks/useToastListener';
import { ToastPayload } from '@/src/utils/alerts';
import { Animated, StyleSheet, View, TouchableOpacity } from 'react-native';

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
  const [animatedValue] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
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
  }, [animatedValue, opacity]);

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-AppConfig.toast.enterOffsetY, 0],
  });

  const colors = getToastColors(toast.type, theme);
  const icon = getToastIcon(toast.type);

  return (
    <Animated.View
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
          <AppText
            variant="body"
            style={[styles.message, { color: colors.text }]}
            numberOfLines={2}
          >
            {toast.message}
          </AppText>
        </View>

        {toast.action && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              console.log('[Toast] Action pressed:', toast.action?.label);
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

function getToastColors(type: ToastPayload['type'], theme: any) {
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
      return 'checkCircle';
    case 'error':
      return 'error';
    case 'warning':
      return 'alert';
    case 'info':
    default:
      return 'helpCircle';
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    minHeight: 48,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  message: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  actionButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    marginLeft: -Spacing.xs,
  },
  actionText: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 0.5,
  },
});
