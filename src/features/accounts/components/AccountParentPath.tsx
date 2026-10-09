import { ArchivedAccountIndicator } from '@/src/components/accounts/ArchivedAccountIndicator';
import { AppIcon, AppText, Icon } from '@/src/components/core';
import { Opacity, Size, Spacing } from '@/src/constants';
import type { AncestorAccountViewModel } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountId } from '@/src/types/ids';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const MAX_VISIBLE = 2;
const HIT_SLOP = { top: Spacing.md, bottom: Spacing.md, left: Spacing.xs, right: Spacing.xs };

interface AccountParentPathProps {
  ancestors: AncestorAccountViewModel[];
  onOpen: (ancestorId: AccountId) => void;
}

export function AccountParentPath({ ancestors, onOpen }: AccountParentPathProps) {
  const { theme } = useTheme();
  if (ancestors.length === 0) return null;

  const isTruncated = ancestors.length > MAX_VISIBLE;
  const visible = isTruncated ? ancestors.slice(-MAX_VISIBLE) : ancestors;
  const separator = <AppIcon name={Icon.ChevronRight} size={Size.xxs} color={theme.textTertiary} />;

  return (
    <View style={styles.path} testID="account-parent-path">
      {isTruncated ? (
        <>
          <AppText variant="caption" color="secondary" importantForAccessibility="no">
            …
          </AppText>
          {separator}
        </>
      ) : null}
      {visible.map((ancestor, index) => (
        <Fragment key={ancestor.id}>
          {index > 0 ? separator : null}
          <Pressable
            onPress={() => onOpen(ancestor.id)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={`Open parent account ${ancestor.name}${ancestor.isArchived ? ', archived' : ''}`}
            style={({ pressed }) => [styles.segment, pressed && styles.pressed]}
          >
            <AppText variant="caption" color="secondary" weight="medium">
              {ancestor.name}
            </AppText>
            {ancestor.isArchived ? <ArchivedAccountIndicator /> : null}
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  path: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    opacity: Opacity.medium,
  },
});
