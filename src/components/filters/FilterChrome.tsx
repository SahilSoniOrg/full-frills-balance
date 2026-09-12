import { Icon, AppButton, AppIcon, AppText, IconButton } from '@/src/components/core';
import { Layout, Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import type { FilterChromeModel } from './filterChromeModel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

interface FilterChromeProps {
  visible: boolean;
  model: FilterChromeModel;
  onClose: () => void;
}

/** Presents any screen-owned filters from a compact header action. */
export function FilterChrome({ visible, model, onClose }: FilterChromeProps) {
  const { theme, fonts } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable
          style={[
            styles.content,
            {
              backgroundColor: theme.background,
              paddingBottom: insets.bottom + Spacing.md,
              borderTopColor: withOpacity(theme.border, Opacity.medium),
            },
          ]}
          onPress={event => event.stopPropagation()}
        >
          <View style={styles.dragHandleContainer}>
            <View
              style={[
                styles.dragHandle,
                { backgroundColor: withOpacity(theme.textSecondary, Opacity.muted) },
              ]}
            />
          </View>

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <AppText variant="heading" style={{ fontFamily: fonts.bold }}>
                {model.title}
              </AppText>
              {model.subtitle ? (
                <AppText variant="caption" color="secondary" style={styles.headerSubtitle}>
                  {model.subtitle}
                </AppText>
              ) : null}
            </View>
            <IconButton
              name={Icon.Close}
              onPress={onClose}
              variant="surface"
              iconColor={theme.textSecondary}
              accessibilityLabel="Close filters"
            />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.list}>
              {model.items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.item, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    onClose();
                    InteractionManager.runAfterInteractions(item.onPress);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.accessibilityLabel ?? `${item.label}: ${item.value}`}
                  testID={item.testID}
                >
                  <AppIcon
                    name={item.icon ?? Icon.Sliders}
                    size={Size.iconMd}
                    color={item.active ? theme.primary : theme.textSecondary}
                  />
                  <View style={styles.copy}>
                    <AppText variant="body" weight="semibold">
                      {item.label}
                    </AppText>
                    <AppText variant="caption" color="secondary" numberOfLines={1}>
                      {item.value}
                    </AppText>
                  </View>
                  <AppIcon
                    name={Icon.ChevronRight}
                    size={Size.iconSm}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View
            style={[styles.footer, { borderTopColor: withOpacity(theme.border, Opacity.heavy) }]}
          >
            <AppButton
              onPress={onClose}
              variant="primary"
              size="lg"
              style={styles.confirmButton}
              accessibilityLabel={model.confirmLabel ?? 'Apply filters'}
            >
              {model.confirmLabel ?? 'Apply Filters'}
            </AppButton>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: Shape.radius.r2,
    borderTopRightRadius: Shape.radius.r2,
    borderTopWidth: 1,
    height: Layout.modal.defaultHeight,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingBottom: Spacing.md,
  },
  dragHandle: {
    width: Layout.modal.dragHandle.width + 16,
    height: Layout.modal.dragHandle.height,
    borderRadius: Layout.modal.dragHandle.borderRadius,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerCopy: {
    flex: 1,
    paddingTop: Spacing.xs,
  },
  headerSubtitle: {
    marginTop: Spacing.xs,
    lineHeight: Typography.sizes.sm * 1.5,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  list: {
    gap: Spacing.xs,
  },
  footer: {
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  confirmButton: {
    alignSelf: 'stretch',
  },
  item: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
});
