import { AppIcon, AppText, ListRow } from '@/src/components/core';
import { AppConfig, Layout, Size, Spacing } from '@/src/constants';
import { InfoSheet } from '@/src/components/common/InfoSheet';
import Account from '@/src/data/models/Account';
import { AccountId, PlainAccount } from '@/src/types/domain';
import {
  ArchiveCascadeNode,
  buildArchiveCascadeNodes,
  defaultCascadeSelection,
} from '@/src/utils/accountArchive';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

type AccountArchiveCascadeModalProps = {
  visible: boolean;
  archiving: boolean;
  rootAccountId: AccountId;
  allAccounts: (Account | PlainAccount)[];
  onClose: () => void;
  onConfirm: (selectedIds: AccountId[]) => void;
};

type CascadeSelectionEditorProps = {
  nodes: ArchiveCascadeNode[];
  archiving: boolean;
  onClose: () => void;
  onConfirm: (selectedIds: AccountId[]) => void;
  title: string;
};

function CascadeSelectionEditor({
  nodes,
  archiving,
  onClose,
  onConfirm,
  title,
}: CascadeSelectionEditorProps) {
  const { theme } = useTheme();
  const [selectedIds, setSelectedIds] = useState<Set<AccountId>>(() =>
    defaultCascadeSelection(nodes, archiving),
  );

  const toggleId = (id: AccountId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <InfoSheet
      visible
      title={title}
      onClose={onClose}
      maxHeightPercent={80}
      primaryAction={{
        label: AppConfig.strings.common.confirm,
        onPress: () => onConfirm(Array.from(selectedIds)),
        disabled: selectedIds.size === 0,
      }}
      secondaryAction={{
        label: AppConfig.strings.common.cancel,
        onPress: onClose,
        variant: 'outline',
      }}
    >
      <AppText variant="body" color="secondary" style={styles.description}>
        {archiving
          ? AppConfig.strings.accounts.archive.cascadeArchiveDescription
          : AppConfig.strings.accounts.archive.cascadeUnarchiveDescription}
      </AppText>
      <ScrollView style={styles.list}>
        {nodes.map(({ account, depth }: ArchiveCascadeNode) => {
          const isSelected = selectedIds.has(account.id);
          return (
            <View key={account.id} style={{ paddingLeft: depth * Spacing.lg }}>
              <ListRow
                title={account.name}
                onPress={() => toggleId(account.id)}
                padding="md"
                leading={
                  <AppIcon
                    name={isSelected ? 'checkSquare' : 'square'}
                    size={Size.iconMd}
                    color={isSelected ? theme.primary : theme.textTertiary}
                  />
                }
              />
            </View>
          );
        })}
      </ScrollView>
    </InfoSheet>
  );
}

export function AccountArchiveCascadeModal({
  visible,
  archiving,
  rootAccountId,
  allAccounts,
  onClose,
  onConfirm,
}: AccountArchiveCascadeModalProps) {
  const nodes = useMemo(
    () => buildArchiveCascadeNodes(rootAccountId, allAccounts),
    [rootAccountId, allAccounts],
  );

  const title = archiving
    ? AppConfig.strings.accounts.archive.cascadeArchiveTitle
    : AppConfig.strings.accounts.archive.cascadeUnarchiveTitle;

  if (!visible) return null;

  return (
    <CascadeSelectionEditor
      key={`${rootAccountId}-${archiving}`}
      nodes={nodes}
      archiving={archiving}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
    />
  );
}

const styles = StyleSheet.create({
  description: {
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  list: {
    maxHeight: Layout.modal.listMaxHeight,
  },
});
