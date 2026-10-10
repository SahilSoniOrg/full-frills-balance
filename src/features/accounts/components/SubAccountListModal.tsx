import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppText, Icon, IconButton, IvyIcon, type IconName } from '@/src/components/core';
import { BorderWidth, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { getReadableColor, withOpacity } from '@/src/utils/color-math';
import { SubAccountViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

// Balances shrink at most to ~0.75x (the old 0.85 floor could still truncate crore amounts).
const BODY_BALANCE_FIT = {
  maxFontSize: Typography.roles.body.fontSize,
  minFontSize: Typography.sizes.xs,
  lineHeightRatio: Typography.roles.body.lineHeight / Typography.roles.body.fontSize,
  hug: true,
};
const LARGE_BALANCE_FIT = {
  maxFontSize: Typography.roles.bodyLarge.fontSize,
  minFontSize: Typography.sizes.sm,
  lineHeightRatio: Typography.roles.bodyLarge.lineHeight / Typography.roles.bodyLarge.fontSize,
  hug: true,
};

export interface SubAccountTreeParent {
  name: string;
  icon: IconName | null;
  accountType: string;
  color?: string;
  balanceAmount: number | null;
  currencyCode: string;
}

interface SubAccountListModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenAccount: (account: SubAccountViewModel) => void;
  parent: SubAccountTreeParent;
  subAccounts: SubAccountViewModel[];
  isLoading: boolean;
}

const NODE = Size.lg;
const RAIL = NODE;
const ROW_PADDING = Spacing.md;
const LINE_X = (RAIL - BorderWidth.thin) / 2;
const ARM_Y = ROW_PADDING + NODE / 2 - BorderWidth.thin / 2;
const STEM_TOP = ROW_PADDING + NODE;

export interface AnnotatedSubAccount extends SubAccountViewModel {
  childCount: number;
  isLastSibling: boolean;
  /**
   * One entry per ancestor, outermost first: true when that ancestor still has
   * a later sibling, so its guide line passes through this row.
   */
  ancestorContinues: boolean[];
  ancestorIds: string[];
  /** Fraction of the sibling group's total; null when siblings can't be compared. */
  share: number | null;
}

export function annotateSubAccountTree(accounts: SubAccountViewModel[]): AnnotatedSubAccount[] {
  const parentIndex: number[] = [];
  const stack: number[] = [];
  accounts.forEach((account, index) => {
    while (stack.length > 0 && accounts[stack[stack.length - 1]].level >= account.level) {
      stack.pop();
    }
    parentIndex.push(stack.length > 0 ? stack[stack.length - 1] : -1);
    stack.push(index);
  });

  const siblings = new Map<number, number[]>();
  parentIndex.forEach((parent, index) => {
    siblings.set(parent, [...(siblings.get(parent) ?? []), index]);
  });

  const childCount = accounts.map((_, index) => siblings.get(index)?.length ?? 0);
  const isLastSibling = accounts.map(() => false);
  const share: (number | null)[] = accounts.map(() => null);

  siblings.forEach(group => {
    isLastSibling[group[group.length - 1]] = true;
    const currency = accounts[group[0]].currencyCode;
    const comparable = group.every(
      index => accounts[index].currencyCode === currency && accounts[index].balanceAmount >= 0,
    );
    const total = group.reduce((sum, index) => sum + accounts[index].balanceAmount, 0);
    if (group.length < 2 || !comparable || total <= 0) return;
    group.forEach(index => {
      share[index] = accounts[index].balanceAmount / total;
    });
  });

  return accounts.map((account, index) => {
    const ancestors: number[] = [];
    for (let parent = parentIndex[index]; parent >= 0; parent = parentIndex[parent]) {
      ancestors.unshift(parent);
    }
    return {
      ...account,
      childCount: childCount[index],
      isLastSibling: isLastSibling[index],
      ancestorContinues: ancestors.map(ancestor => !isLastSibling[ancestor]),
      ancestorIds: ancestors.map(ancestor => accounts[ancestor].id),
      share: share[index],
    };
  });
}

function countPhrase(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function structureLabel(accounts: AnnotatedSubAccount[]) {
  const groups = accounts.filter(account => account.childCount > 0).length;
  const leaves = accounts.length - groups;
  return [
    groups > 0 ? countPhrase(groups, 'group', 'groups') : null,
    leaves > 0 ? countPhrase(leaves, 'account', 'accounts') : null,
  ]
    .filter(Boolean)
    .join(', ');
}

function formatShare(share: number) {
  if (share > 0 && share < 0.01) return '<1%';
  return `${Math.round(share * 100)}%`;
}

type RailMode = 'empty' | 'pass' | 'tee' | 'elbow';

function RailColumn({ mode, color }: { mode: RailMode; color: string }) {
  if (mode === 'empty') return <View style={styles.railColumn} />;
  const line = { backgroundColor: color };
  return (
    <View style={styles.railColumn}>
      <View
        style={[styles.railLine, mode === 'elbow' ? styles.railToArm : styles.railFull, line]}
      />
      {mode !== 'pass' ? <View style={[styles.railArm, line]} /> : null}
    </View>
  );
}

function Stem({ left, color }: { left: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.stem, { left: left + LINE_X, backgroundColor: color }]}
    />
  );
}

const SubAccountTreeRow = memo(function SubAccountTreeRow({
  account,
  isExpanded,
  lineColor,
  trackColor,
  pressedColor,
  toggleColor,
  iconColor,
  iconBackground,
  stackBalances,
  showCurrency,
  showShare,
  reserveToggle,
  onOpen,
  onToggle,
}: {
  account: AnnotatedSubAccount;
  isExpanded: boolean;
  lineColor: string;
  trackColor: string;
  pressedColor: string;
  toggleColor: string;
  iconColor: string;
  iconBackground: string;
  stackBalances: boolean;
  showCurrency: boolean;
  showShare: boolean;
  reserveToggle: boolean;
  onOpen: (account: SubAccountViewModel) => void;
  onToggle: (id: string) => void;
}) {
  const isGroup = account.childCount > 0;
  const depth = account.level + 1;
  const share = showShare ? account.share : null;
  const rowLabel = [
    account.name,
    isGroup ? `group, ${account.childCount} inside` : null,
    `level ${depth}`,
    share !== null ? `${formatShare(share)} of group` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={() => onOpen(account)}
      accessibilityRole="button"
      accessibilityLabel={rowLabel}
      accessibilityHint="Opens this account"
      testID={`sub-account-row-${account.id}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: pressedColor }]}
    >
      <View style={styles.rail} testID={`sub-account-rail-${account.id}`}>
        {Array.from({ length: depth }, (_, column) => {
          const mode: RailMode =
            column === depth - 1
              ? account.isLastSibling
                ? 'elbow'
                : 'tee'
              : account.ancestorContinues[column]
                ? 'pass'
                : 'empty';
          return <RailColumn key={column} mode={mode} color={lineColor} />;
        })}
      </View>
      {isGroup && isExpanded ? <Stem left={depth * RAIL} color={lineColor} /> : null}
      <View style={styles.body}>
        <View style={[styles.topLine, stackBalances && styles.stackedTopLine]}>
          <View style={styles.identity}>
            <IvyIcon
              name={account.icon}
              fallbackIcon={account.icon || 'wallet'}
              label={account.name}
              color={iconBackground}
              iconColor={iconColor}
              size={NODE}
              shape={isGroup ? 'square' : 'circle'}
            />
            <View style={styles.copy}>
              <AppText variant="body" weight={isGroup ? 'semibold' : 'medium'} numberOfLines={2}>
                {account.name}
              </AppText>
              {isGroup ? (
                <AppText variant="caption" color="secondary">
                  {`${account.childCount} inside`}
                </AppText>
              ) : null}
            </View>
          </View>
          <View style={[styles.balance, stackBalances && styles.stackedBalance]}>
            <MoneyText
              amount={account.balanceAmount}
              currencyCode={account.currencyCode}
              variant="body"
              weight="semibold"
              align={stackBalances ? 'left' : 'right'}
              fit={BODY_BALANCE_FIT}
            />
            {showCurrency ? (
              <AppText variant="caption" color="secondary" align={stackBalances ? 'left' : 'right'}>
                {account.currencyCode}
              </AppText>
            ) : null}
          </View>
          {isGroup ? (
            <IconButton
              name={isExpanded ? Icon.ChevronUp : Icon.ChevronDown}
              size={Size.iconSm}
              variant="clear"
              iconColor={toggleColor}
              onPress={() => onToggle(account.id)}
              accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} accounts in ${account.name}`}
              accessibilityState={{ expanded: isExpanded }}
              testID={`sub-account-toggle-${account.id}`}
              style={stackBalances && styles.stackedToggle}
            />
          ) : reserveToggle && !stackBalances ? (
            <View style={styles.toggleSlot} />
          ) : null}
        </View>
        {share !== null ? (
          <View
            style={styles.shareLine}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            testID={`sub-account-share-${account.id}`}
          >
            <View style={[styles.shareTrack, { backgroundColor: trackColor }]}>
              <View
                style={[styles.shareFill, { width: `${share * 100}%`, backgroundColor: iconColor }]}
              />
            </View>
            <AppText variant="caption" color="secondary" tabular style={styles.sharePercent}>
              {formatShare(share)}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

export function SubAccountListModal({
  visible,
  onClose,
  onOpenAccount,
  parent,
  subAccounts,
  isLoading,
}: SubAccountListModalProps) {
  const { theme } = useTheme();
  const { isPrivacyMode } = usePrivacyScope();
  const { width, fontScale } = useWindowDimensions();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const stackBalances = width / fontScale < 320;
  const tree = annotateSubAccountTree(subAccounts);
  const visibleRows = tree.filter(account => account.ancestorIds.every(id => expandedIds.has(id)));
  const hasGroups = tree.some(account => account.childCount > 0);
  const onToggle = useCallback((id: string) => {
    setExpandedIds(current => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const hasMultipleCurrencies = new Set(subAccounts.map(account => account.currencyCode)).size > 1;
  const { accentColor } = resolveAccountAppearance(
    { accountType: parent.accountType, color: parent.color },
    theme,
  );
  const lineColor = withOpacity(theme.textTertiary, Opacity.medium);
  const trackColor = withOpacity(theme.textTertiary, Opacity.active);
  const pressedColor = withOpacity(theme.text, Opacity.selection);
  const hasTree = !isLoading && tree.length > 0;

  return (
    <ModalSurface
      visible={visible}
      title="Sub-Accounts"
      onClose={onClose}
      position="bottomSheet"
      animationType="fade"
      maxHeightPercent={70}
      fixedHeight={false}
      accessibilityCloseLabel="Close sub-accounts"
    >
      <View>
        <View style={styles.row}>
          {hasTree ? <Stem left={0} color={lineColor} /> : null}
          <View style={[styles.body, styles.rootBody]}>
            <View style={[styles.topLine, stackBalances && styles.stackedTopLine]}>
              <View style={styles.identity}>
                <IvyIcon
                  name={parent.icon || undefined}
                  fallbackIcon={getAccountFallbackIcon(parent.accountType)}
                  label={parent.name}
                  color={accentColor}
                  size={NODE}
                  shape="square"
                />
                <View style={styles.copy}>
                  <AppText variant="bodyLarge" weight="semibold" numberOfLines={2}>
                    {parent.name}
                  </AppText>
                  {hasTree ? (
                    <AppText variant="caption" color="secondary">
                      {structureLabel(tree)}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <View style={[styles.balance, stackBalances && styles.stackedBalance]}>
                <MoneyText
                  amount={parent.balanceAmount ?? 0}
                  loading={parent.balanceAmount === null}
                  currencyCode={parent.currencyCode}
                  variant="bodyLarge"
                  weight="bold"
                  align={stackBalances ? 'left' : 'right'}
                  fit={LARGE_BALANCE_FIT}
                />
                <AppText
                  variant="caption"
                  color="secondary"
                  align={stackBalances ? 'left' : 'right'}
                >
                  Total
                </AppText>
              </View>
            </View>
          </View>
        </View>
        {isLoading ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator color={theme.textSecondary} />
            <AppText variant="body" color="secondary">
              Loading sub-accounts...
            </AppText>
          </View>
        ) : tree.length === 0 ? (
          <View style={styles.emptyContainer}>
            <AppText variant="body" color="secondary">
              No accounts under {parent.name}
            </AppText>
          </View>
        ) : (
          <View>
            {visibleRows.map(account => (
              <SubAccountTreeRow
                key={account.id}
                account={account}
                isExpanded={expandedIds.has(account.id)}
                lineColor={lineColor}
                trackColor={trackColor}
                pressedColor={pressedColor}
                toggleColor={theme.textSecondary}
                iconColor={getReadableColor(account.accountColor, theme.surface)}
                iconBackground={withOpacity(account.accountColor, Opacity.soft)}
                stackBalances={stackBalances}
                showCurrency={hasMultipleCurrencies}
                showShare={!isPrivacyMode}
                reserveToggle={hasGroups}
                onOpen={onOpenAccount}
                onToggle={onToggle}
              />
            ))}
          </View>
        )}
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: Shape.radius.md,
  },
  rail: {
    flexDirection: 'row',
  },
  railColumn: {
    width: RAIL,
  },
  railLine: {
    position: 'absolute',
    left: LINE_X,
    top: 0,
    width: BorderWidth.thin,
  },
  railFull: {
    bottom: 0,
  },
  railToArm: {
    height: ARM_Y + BorderWidth.thin,
  },
  railArm: {
    position: 'absolute',
    left: LINE_X,
    top: ARM_Y,
    width: RAIL - LINE_X - Spacing.xs,
    height: BorderWidth.thin,
  },
  stem: {
    position: 'absolute',
    top: STEM_TOP,
    bottom: 0,
    width: BorderWidth.thin,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingVertical: ROW_PADDING,
    gap: Spacing.sm,
  },
  rootBody: {
    paddingBottom: Spacing.lg,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stackedTopLine: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.xs,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs / 2,
  },
  balance: {
    maxWidth: '45%',
    flexShrink: 1,
    gap: Spacing.xs / 2,
  },
  stackedBalance: {
    maxWidth: '100%',
  },
  toggleSlot: {
    width: Size.xl,
  },
  stackedToggle: {
    alignSelf: 'flex-start',
  },
  shareLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginLeft: NODE + Spacing.md,
  },
  shareTrack: {
    flex: 1,
    height: Spacing.xs,
    borderRadius: Shape.radius.full,
    overflow: 'hidden',
  },
  shareFill: {
    height: '100%',
    borderRadius: Shape.radius.full,
  },
  sharePercent: {
    minWidth: Spacing.xxxl,
    textAlign: 'right',
  },
  emptyContainer: {
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
    alignItems: 'center',
  },
});
