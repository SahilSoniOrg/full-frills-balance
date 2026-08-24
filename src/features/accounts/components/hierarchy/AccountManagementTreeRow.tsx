import { ArchivedAccountIndicator } from '@/src/components/common/ArchivedAccountIndicator';
import { AppIcon, AppText, IvyIcon } from '@/src/components/core';
import { Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import type { FlattenedAccountTreeRow } from '@/src/services/accounts/accountTreeProjection';
import type { AccountTreeDropKind } from '@/src/services/accounts/accountTreeTargets';
import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountId } from '@/src/types/ids';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle } from 'react-native-reanimated';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

export const ACCOUNT_TREE_ROW_MIN_HEIGHT = 56;

interface AccountManagementTreeRowProps {
  row: FlattenedAccountTreeRow;
  account: AccountFields;
  isOrganizing: boolean;
  isPending: boolean;
  pendingPreview?: string;
  isActive: boolean;
  dragTranslation: number;
  isActiveSubtree: boolean;
  dropIntent: AccountTreeDropKind | null;
  theme: ReturnType<typeof useTheme>['theme'];
  onBegin: (id: AccountId) => void;
  onUpdate: (id: AccountId, translationY: number, absoluteY: number) => void;
  onFinish: () => void;
  onCancel: () => void;
  onPress: () => void;
  onLayout: (accountId: AccountId, height: number) => void;
}

export function AccountManagementTreeRow({
  row,
  account,
  isOrganizing,
  isPending,
  pendingPreview,
  isActive,
  dragTranslation,
  isActiveSubtree,
  dropIntent,
  theme,
  onBegin,
  onUpdate,
  onFinish,
  onCancel,
  onPress,
  onLayout,
}: AccountManagementTreeRowProps) {
  const animatedStyle = useAnimatedStyle(
    () => ({ transform: [{ translateY: isActiveSubtree ? dragTranslation : 0 }] }),
    [dragTranslation, isActiveSubtree],
  );
  const gesture = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => runOnJS(onBegin)(account.id))
    .onUpdate(event => runOnJS(onUpdate)(account.id, event.translationY, event.absoluteY))
    .onEnd(() => runOnJS(onFinish)())
    .onFinalize((_event, success) => {
      if (!success) runOnJS(onCancel)();
    });
  const { accentColor } = resolveAccountAppearance(account, theme);
  const recordLayout = (event: LayoutChangeEvent) =>
    onLayout(account.id, event.nativeEvent.layout.height);

  return (
    <Animated.View style={animatedStyle} onLayout={recordLayout}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: row.childCount > 0 ? row.isExpanded : undefined }}
        style={[
          styles.row,
          { paddingLeft: Spacing.md + row.depth * 22, borderBottomColor: theme.divider },
          isActive && { backgroundColor: theme.surfaceSecondary },
          dropIntent === 'child' && {
            backgroundColor: theme.primaryLight,
            borderColor: theme.primary,
            borderWidth: 1,
          },
          dropIntent === 'outside' && { backgroundColor: theme.warningLight },
        ]}
      >
        {dropIntent === 'sibling-before' && (
          <View
            style={[
              styles.insertionLine,
              styles.insertionLineBefore,
              { backgroundColor: theme.primary },
            ]}
          />
        )}
        {dropIntent === 'sibling-after' && (
          <View
            style={[
              styles.insertionLine,
              styles.insertionLineAfter,
              { backgroundColor: theme.primary },
            ]}
          />
        )}
        <View style={styles.connector}>
          {row.depth > 0 && (
            <View style={[styles.connectorLine, { borderLeftColor: theme.divider }]} />
          )}
        </View>
        {isOrganizing && (
          <GestureDetector gesture={gesture}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Drag ${account.name}`}
              accessibilityHint="Drag to reorder or change this account's parent"
              style={styles.handle}
            >
              <Text style={[styles.handleText, { color: theme.textTertiary }]}>⠿</Text>
            </Pressable>
          </GestureDetector>
        )}
        <View style={styles.iconWrapper}>
          <IvyIcon
            name={account.icon}
            fallbackIcon={getAccountFallbackIcon(account.accountType)}
            label={account.name}
            color={accentColor}
            size={Size.lg}
            shape={row.childCount > 0 ? 'square' : 'circle'}
          />
        </View>
        <View style={styles.copy}>
          <View style={styles.titleLine}>
            {isAccountArchived(account) && <ArchivedAccountIndicator emphasized />}
            <AppText
              variant="body"
              weight={row.childCount > 0 ? 'bold' : 'regular'}
              numberOfLines={1}
              style={styles.title}
            >
              {account.name}
            </AppText>
            {row.childCount > 0 && (
              <AppText variant="caption" color="secondary">
                {row.childCount}
              </AppText>
            )}
          </View>
          {pendingPreview && (
            <AppText variant="caption" color="secondary">
              {pendingPreview}
            </AppText>
          )}
          {isPending && !pendingPreview && (
            <AppText variant="caption" color="secondary">
              Included in staged changes
            </AppText>
          )}
        </View>
        {row.childCount > 0 && (
          <AppIcon
            name={row.isExpanded ? 'chevronDown' : 'chevronRight'}
            size={Size.iconXs}
            color={theme.textTertiary}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: ACCOUNT_TREE_ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: Spacing.md,
  },
  insertionLine: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    height: 2,
    zIndex: 1,
  },
  insertionLineBefore: { top: 0 },
  insertionLineAfter: { bottom: 0 },
  connector: { width: Spacing.sm, height: '100%', justifyContent: 'center' },
  connectorLine: { height: '70%', borderLeftWidth: 1 },
  iconWrapper: { width: Size.lg, marginRight: Spacing.sm },
  copy: { flex: 1, gap: Spacing.xs / 2, paddingVertical: Spacing.sm },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  title: { flexShrink: 1 },
  handle: { width: 40, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  handleText: { fontSize: Typography.sizes.lg, lineHeight: Size.iconSm },
});
