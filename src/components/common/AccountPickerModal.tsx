import { AppButton, AppIcon, AppInput, AppText, ListRow } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import {
  getAccountSections,
  getAccountVariant,
  getSectionColor,
} from '@/src/utils/accountCategory';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type CreateAccountIntent = {
  suggestedName: string;
};

type BaseProps = {
  visible: boolean;
  accounts: Account[];
  title?: string;
  onClose: () => void;
  onCreateRequest?: (intent: CreateAccountIntent) => void;
};

export type SingleProps = BaseProps & {
  multiple?: false;
  selectedId?: string;
  onSelect: (accountId: string) => void;
};

export type MultiProps = BaseProps & {
  multiple: true;
  selectedIds?: string[];
  onSelect: (accountIds: string[]) => void;
};

type AccountPickerModalProps = SingleProps | MultiProps;

export function AccountPickerModal(props: AccountPickerModalProps) {
  const { visible, accounts, title = 'Select Account', onClose, onCreateRequest, multiple } = props;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // State for single select
  const [selectedId, setSelectedId] = useState('');
  // State for multi select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      if (props.multiple) {
        setSelectedIds(new Set(props.selectedIds || []));
      } else {
        setSelectedId(props.selectedId || '');
      }
      setSearchQuery('');
      setCollapsedSections(new Set());
    }
  }, [visible, props]);

  const isSearchMode = searchQuery.trim().length > 0;
  useEffect(() => {
    // If the user starts searching, force expand everything and forget previous collapses.
    if (isSearchMode) {
      setCollapsedSections(new Set());
    }
  }, [isSearchMode]);

  const leafAccounts = useMemo(() => {
    const parentIds = new Set(accounts.map(a => a.parentAccountId).filter(Boolean) as string[]);
    const leaves = accounts.filter(a => !parentIds.has(a.id));

    if (!searchQuery.trim()) return leaves;

    const q = searchQuery.toLowerCase();
    return leaves.filter(
      a =>
        a.name.toLowerCase().includes(q) ||
        a.accountType.toLowerCase().includes(q) ||
        a.currencyCode.toLowerCase().includes(q),
    );
  }, [accounts, searchQuery]);

  const sections = useMemo(() => getAccountSections(leafAccounts), [leafAccounts]);

  const handleSelect = useCallback(
    (id: string) => {
      if (props.multiple) {
        setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else {
        setSelectedId(id);
        props.onSelect(id);
      }
    },
    [props],
  );

  const handleApply = useCallback(() => {
    if (props.multiple) {
      props.onSelect(Array.from(selectedIds));
      onClose();
    }
  }, [props, selectedIds, onClose]);

  const toggleSection = useCallback((sectionTitle: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionTitle)) {
        next.delete(sectionTitle);
      } else {
        next.add(sectionTitle);
      }
      return next;
    });
  }, []);

  const getAccountColor = (type: string) => {
    const variant = getAccountVariant(type);
    if (variant === 'asset') return theme.asset;
    if (variant === 'liability') return theme.liability;
    if (variant === 'equity') return theme.equity;
    if (variant === 'income') return theme.income;
    if (variant === 'expense') return theme.expense;
    return theme.primary;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      hardwareAccelerated
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
              <View style={styles.modalHeader}>
                <AppText variant="heading">{title}</AppText>
                <TouchableOpacity
                  onPress={onClose}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  style={styles.headerIconButton}
                >
                  <AppIcon name="close" size={Size.iconMd} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.searchContainer}>
                <AppInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search accounts..."
                  leftIcon="search"
                  variant="default"
                  background="surfaceSecondary"
                  borderColor="transparent"
                  borderRadius="full"
                />
              </View>

              <SectionList
                key={visible ? 'open' : 'closed'}
                sections={sections}
                keyExtractor={item => item.id}
                stickySectionHeadersEnabled={true}
                renderSectionHeader={({ section: { title: sectionTitle, data } }) => {
                  const isCollapsed = collapsedSections.has(sectionTitle);
                  const color = getSectionColor(sectionTitle, theme);

                  return (
                    <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
                      <TouchableOpacity
                        activeOpacity={Opacity.medium}
                        onPress={() => toggleSection(sectionTitle)}
                        style={styles.sectionToggle}
                      >
                        <View style={styles.sectionTitleRow}>
                          <View style={[styles.sectionDot, { backgroundColor: color }]} />
                          <AppText variant="subheading" weight="bold" color="secondary">
                            {sectionTitle}
                          </AppText>
                          <View
                            style={[styles.countBadge, { backgroundColor: theme.surfaceSecondary }]}
                          >
                            <AppText variant="caption" weight="bold" color="tertiary">
                              {data.length}
                            </AppText>
                          </View>
                        </View>

                        <View style={styles.sectionActions}>
                          {!searchQuery && (
                            <AppIcon
                              name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                              size={Size.iconSm}
                              color={theme.textSecondary}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                renderItem={({ item, section }) => {
                  if (collapsedSections.has(section.title)) return null;

                  const isSelected = multiple ? selectedIds.has(item.id) : item.id === selectedId;
                  const accountColor = getAccountColor(item.accountType);

                  return (
                    <ListRow
                      title={item.name}
                      titleColor={getAccountVariant(item.accountType)}
                      subtitle={`${item.accountType} • ${item.currencyCode}`}
                      onPress={() => handleSelect(item.id)}
                      style={[
                        styles.accountRow,
                        {
                          backgroundColor: theme.surface,
                          borderColor: isSelected ? accountColor : theme.border,
                          borderWidth: isSelected ? 2 : 1,
                        },
                      ]}
                      trailing={
                        multiple && isSelected ? (
                          <AppIcon name="check" size={20} color={accountColor} />
                        ) : undefined
                      }
                      padding="md"
                    />
                  );
                }}
                contentContainerStyle={styles.accountsListContent}
                style={styles.accountsList}
                ListEmptyComponent={
                  searchQuery.trim() ? (
                    <View style={styles.emptyContainer}>
                      <AppIcon
                        name="search"
                        size={Size.iconXl}
                        color={theme.textTertiary}
                        opacity={Opacity.muted}
                      />
                      <AppText
                        variant="body"
                        color="tertiary"
                        align="center"
                        style={{ marginTop: Spacing.md, marginBottom: Spacing.lg }}
                      >
                        No accounts found matching &quot;{searchQuery.trim()}&quot;
                      </AppText>

                      {onCreateRequest && (
                        <AppButton
                          variant="outline"
                          onPress={() => {
                            onClose();
                            onCreateRequest({ suggestedName: searchQuery.trim() });
                          }}
                        >
                          <View
                            style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}
                          >
                            <AppIcon name="plus" size={Size.iconSm} color={theme.primary} />
                            <AppText weight="bold" color="primary">
                              {`Create "${searchQuery.trim()}"`}
                            </AppText>
                          </View>
                        </AppButton>
                      )}
                    </View>
                  ) : null
                }
              />

              {multiple && (
                <View
                  style={[
                    styles.footer,
                    {
                      borderTopColor: theme.border,
                      paddingBottom: Math.max(Spacing.lg, insets.bottom + Spacing.md),
                    },
                  ]}
                >
                  <AppButton onPress={handleApply}>{`Apply (${selectedIds.size})`}</AppButton>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    borderTopLeftRadius: Shape.radius.r2,
    borderTopRightRadius: Shape.radius.r2,
    maxHeight: '85%',
    width: '100%',
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIconButton: {
    padding: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  sectionToggle: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionCreateButton: {
    marginRight: Spacing.xs,
    padding: Spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  accountRow: {
    borderWidth: 1,
    borderRadius: Shape.radius.r3,
    marginBottom: Spacing.sm,
    marginHorizontal: Spacing.lg,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Shape.radius.full,
    marginLeft: Spacing.sm,
  },
  emptyContainer: {
    padding: Spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountsList: {
    flexShrink: 1,
  },
  accountsListContent: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl * 2,
  },
  footer: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
  },
});
