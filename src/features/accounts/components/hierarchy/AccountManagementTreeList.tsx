import { AppButton, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import type { FlattenedAccountTreeRow } from '@/src/services/accounts/accountTreeProjection';
import type {
  AccountTreeDropKind,
  AccountTreeDropTarget,
} from '@/src/services/accounts/accountTreeTargets';
import type { AccountFields, AccountId } from '@/src/types/domain';
import { FlashList } from '@shopify/flash-list';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountManagementTreeRow } from './AccountManagementTreeRow';
import { useAccountTreeDragController } from './useAccountTreeDragController';

interface AccountManagementTreeListProps {
  accounts: readonly AccountFields[];
  rows: readonly FlattenedAccountTreeRow[];
  balancesByAccountId: Map<string, { directTransactionCount?: number }>;
  pendingAccountIds: ReadonlySet<AccountId>;
  pendingPreviews: ReadonlyMap<AccountId, string>;
  isDraftDirty: boolean;
  pendingChangeCount: number;
  isSavingDraft: boolean;
  isOrganizing: boolean;
  onDrop: (target: AccountTreeDropTarget) => void;
  onSaveDraft: () => void;
  onDiscardDraft: () => void;
  onSelectAccount: (accountId: AccountId | null) => void;
  onToggleExpand: (accountId: AccountId) => void;
  onCreateParent: () => void;
  onToggleOrganize: () => void;
}

export function AccountManagementTreeList({
  accounts,
  rows,
  balancesByAccountId,
  pendingAccountIds,
  pendingPreviews,
  isDraftDirty,
  pendingChangeCount,
  isSavingDraft,
  isOrganizing,
  onDrop,
  onSaveDraft,
  onDiscardDraft,
  onSelectAccount,
  onToggleExpand,
  onCreateParent,
  onToggleOrganize,
}: AccountManagementTreeListProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const accountsById = useMemo(
    () => new Map(accounts.map(account => [account.id, account] as const)),
    [accounts],
  );
  const {
    activeAccountId,
    dragTranslation,
    dragScrollDelta,
    hover,
    dragLayout,
    listRef,
    listViewportRef,
    beginDrag,
    updateDrag,
    finishDrag,
    cancelDrag,
    onRowLayout,
    onListLayout,
    onListScroll,
    onContentSizeChange,
  } = useAccountTreeDragController({ accounts, rows, balancesByAccountId, onDrop });
  const hoverAccount = hover ? accountsById.get(hover.hoveredAccountId) : undefined;
  const dropIntent =
    hover && hoverAccount ? getDropIntentLabel(hover.kind, hoverAccount.name) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="body" color="secondary">
          {AppConfig.strings.accounts.hierarchy.description}
        </AppText>
        <View style={styles.headerActions}>
          <AppButton onPress={onCreateParent} variant="secondary" size="sm">
            {AppConfig.strings.accounts.hierarchy.newParentButton}
          </AppButton>
          <AppButton
            onPress={onToggleOrganize}
            variant={isOrganizing ? 'primary' : 'secondary'}
            size="sm"
            accessibilityLabel={isOrganizing ? 'Finish organizing accounts' : 'Organize accounts'}
          >
            {isOrganizing ? 'Done' : 'Organize'}
          </AppButton>
        </View>
      </View>
      <View ref={listViewportRef} style={styles.listViewport} onLayout={onListLayout}>
        <FlashList
          ref={listRef}
          data={dragLayout.rows}
          maintainVisibleContentPosition={{ disabled: true }}
          keyExtractor={row => row.accountId}
          renderItem={({ item }) => {
            const account = accountsById.get(item.accountId);
            if (!account) return null;
            return (
              <AccountManagementTreeRow
                row={item}
                account={account}
                isOrganizing={isOrganizing}
                isPending={pendingAccountIds.has(account.id)}
                pendingPreview={pendingPreviews.get(account.id)}
                isActive={activeAccountId === account.id}
                dragTranslation={
                  dragTranslation + dragScrollDelta - dragLayout.activeTranslationAdjustment
                }
                isActiveSubtree={dragLayout.activeSubtreeAccountIds.has(account.id)}
                dropIntent={
                  hover?.target != null && hover.hoveredAccountId === account.id ? hover.kind : null
                }
                theme={theme}
                onBegin={beginDrag}
                onUpdate={updateDrag}
                onFinish={finishDrag}
                onCancel={cancelDrag}
                onLayout={onRowLayout}
                onPress={() =>
                  item.childCount > 0 ? onToggleExpand(account.id) : onSelectAccount(account.id)
                }
              />
            );
          }}
          contentContainerStyle={styles.listContent}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          onContentSizeChange={onContentSizeChange}
        />
        {activeAccountId && dropIntent && (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={[
              styles.dropIntent,
              { backgroundColor: hover?.target ? theme.primary : theme.error },
            ]}
          >
            <AppText variant="caption" weight="bold" style={{ color: theme.onPrimary }}>
              {hover?.target ? dropIntent : `Can't ${dropIntent.toLowerCase()}`}
            </AppText>
          </View>
        )}
      </View>
      {isDraftDirty && (
        <View
          style={[
            styles.saveBar,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.divider,
              paddingBottom: Math.max(Spacing.md, insets.bottom + Spacing.sm),
            },
          ]}
        >
          <View style={styles.saveCopy}>
            <AppText variant="body" weight="bold">
              Save {pendingChangeCount} {pendingChangeCount === 1 ? 'change' : 'changes'}
            </AppText>
            <AppText variant="caption" color="secondary">
              Changes are staged until saved.
            </AppText>
          </View>
          <AppButton onPress={onDiscardDraft} variant="ghost" size="sm" disabled={isSavingDraft}>
            Discard
          </AppButton>
          <AppButton onPress={onSaveDraft} variant="primary" size="sm" loading={isSavingDraft}>
            Save
          </AppButton>
        </View>
      )}
    </View>
  );
}

function getDropIntentLabel(kind: AccountTreeDropKind, accountName: string): string {
  switch (kind) {
    case 'child':
      return `Make child of ${accountName}`;
    case 'outside':
      return `Move outside ${accountName}`;
    case 'sibling-before':
      return `Move before ${accountName}`;
    case 'sibling-after':
      return `Move after ${accountName}`;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: Spacing.lg, gap: Spacing.md },
  headerActions: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  listViewport: { flex: 1 },
  listContent: { paddingBottom: Spacing.xxxl },
  dropIntent: {
    position: 'absolute',
    top: Spacing.sm,
    alignSelf: 'center',
    maxWidth: '90%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Spacing.full,
    zIndex: 2,
  },
  saveBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  saveCopy: { flex: 1, gap: Spacing.xs / 2 },
});
