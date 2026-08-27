import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ModalSurfaceProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeightPercent?: number;
  accessibilityCloseLabel?: string;
  fixedHeight?: boolean;
  scrollable?: boolean;
  /**
   * If false, renders as a standard absolute-positioned View instead of a native Modal.
   * Useful for avoiding iOS native Modal deadlocks during transitions.
   */
  useNativeModal?: boolean;
  position?: 'center' | 'bottomSheet';
  animationType?: 'fade' | 'slide';
  contentStyle?: StyleProp<ViewStyle>;
}

export function ModalSurface({
  visible,
  title,
  onClose,
  children,
  footer,
  maxHeightPercent = AppConfig.layout.popupModalHeightPercent,
  accessibilityCloseLabel = 'Close dialog',
  fixedHeight = true,
  scrollable = true,
  useNativeModal = process.env.NODE_ENV !== 'test',
  position = 'center',
  animationType,
  contentStyle,
}: ModalSurfaceProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isBottomSheet = position === 'bottomSheet';

  const content = (
    <View
      style={[
        styles.overlay,
        isBottomSheet ? styles.overlayBottomSheet : styles.overlayCenter,
        { backgroundColor: theme.overlay },
      ]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={accessibilityCloseLabel}
      />
      <View
        style={[
          isBottomSheet ? styles.modalContainerBottomSheet : styles.modalContainerCenter,
          fixedHeight ? { height: `${maxHeightPercent}%` } : { maxHeight: `${maxHeightPercent}%` },
        ]}
      >
        <AppCard
          elevation="lg"
          paddingSize="lg"
          radius="r2"
          style={[
            styles.modalCard,
            isBottomSheet ? styles.modalCardBottomSheet : styles.modalCardCenter,
            fixedHeight ? styles.modalCardFixed : styles.modalCardFit,
            isBottomSheet && { paddingBottom: insets.bottom + Spacing.lg },
            { backgroundColor: theme.surface },
          ]}
        >
          <View style={styles.header}>
            <AppText variant="subheading" weight="bold">
              {title}
            </AppText>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={accessibilityCloseLabel}
            >
              <AppIcon name="close" size={Size.sm} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {scrollable ? (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              style={fixedHeight ? styles.scrollFixed : styles.scrollFit}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.staticContent, contentStyle]}>{children}</View>
          )}

          {footer}
        </AppCard>
      </View>
    </View>
  );

  if (useNativeModal) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType={animationType ?? (isBottomSheet ? 'slide' : 'fade')}
        onRequestClose={onClose}
      >
        {content}
      </Modal>
    );
  }

  if (!visible) return null;

  return <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]}>{content}</View>;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  overlayCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  overlayBottomSheet: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 0,
  },
  modalContainerCenter: {
    width: '100%',
    maxWidth: AppConfig.layout.popupModalMaxWidth,
    flexShrink: 1,
  },
  modalContainerBottomSheet: {
    width: '100%',
    maxWidth: '100%',
    flexShrink: 1,
  },
  modalCard: {
    width: '100%',
  },
  modalCardCenter: {
    borderRadius: Shape.radius.lg,
  },
  modalCardBottomSheet: {
    borderTopLeftRadius: Shape.radius.r2,
    borderTopRightRadius: Shape.radius.r2,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  modalCardFixed: {
    height: '100%',
  },
  modalCardFit: {
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  scrollFixed: {
    marginTop: Spacing.md,
    flex: 1,
    minHeight: 0,
  },
  scrollFit: {
    marginTop: Spacing.md,
    flexGrow: 0,
  },
  scrollContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  staticContent: {
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
});
