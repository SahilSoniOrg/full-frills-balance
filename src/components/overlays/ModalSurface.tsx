import { Icon, AppCard, AppText, IconButton } from '@/src/components/core';
import { AppConfig, ChromeMotion, Shape, Spacing } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
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
  closeTestID?: string;
  fixedHeight?: boolean;
  scrollable?: boolean;
  /**
   * If false, renders as a standard absolute-positioned View instead of a native Modal.
   * Useful for avoiding iOS native Modal deadlocks during transitions.
   */
  useNativeModal?: boolean;
  position?: 'center' | 'bottomSheet';
  /** Native Modal animation for overlay enter/exit. Moti owns the card spring. */
  animationType?: 'fade' | 'slide' | 'none';
  contentStyle?: StyleProp<ViewStyle>;
  /** Fires after the native modal finish-dismiss animation (iOS). */
  onDismiss?: () => void;
}

/**
 * Shared modal / bottom-sheet chrome.
 * Moti springs the card in; overlay stays a plain View so native Modal owns
 * overlay fade. Reduce motion → plain Views (native fade only).
 */
export function ModalSurface({
  visible,
  title,
  onClose,
  children,
  footer,
  maxHeightPercent = AppConfig.layout.popupModalHeightPercent,
  accessibilityCloseLabel = 'Close dialog',
  closeTestID,
  fixedHeight = true,
  scrollable = true,
  useNativeModal = process.env.NODE_ENV !== 'test',
  position = 'center',
  animationType = 'fade',
  contentStyle,
  onDismiss,
}: ModalSurfaceProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isBottomSheet = position === 'bottomSheet';
  const reduceMotion = useReducedMotion();

  const sheetFrom = isBottomSheet
    ? { opacity: 0.92, translateY: ChromeMotion.sheetRisePx }
    : {
        opacity: 0,
        translateY: 8,
        scale: ChromeMotion.dialogFromScale,
      };

  const sheetBody = (
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
        <IconButton
          name={Icon.Close}
          variant="clear"
          iconColor={theme.textSecondary}
          onPress={onClose}
          accessibilityLabel={accessibilityCloseLabel}
          testID={closeTestID}
        />
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
  );

  const sheetStyle: StyleProp<ViewStyle> = [
    isBottomSheet ? styles.modalContainerBottomSheet : styles.modalContainerCenter,
    fixedHeight ? { height: `${maxHeightPercent}%` } : { maxHeight: `${maxHeightPercent}%` },
  ];

  const sheet = reduceMotion ? (
    <View style={sheetStyle}>{sheetBody}</View>
  ) : (
    <MotiView
      from={sheetFrom}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={ChromeMotion.sheetSpring}
      style={sheetStyle}
    >
      {sheetBody}
    </MotiView>
  );

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
      {sheet}
    </View>
  );

  if (useNativeModal) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType={animationType}
        onRequestClose={onClose}
        onDismiss={onDismiss}
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
    flexShrink: 1,
    minHeight: 0,
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
