import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { ScreenWithChrome, type ScreenNavChrome } from '@/src/components/layout';
import { Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { AccountReorderViewModel } from '@/src/features/accounts/hooks/useAccountReorderViewModel';
import {
  getAccountFallbackIcon,
  getAccountIcon,
} from '@/src/features/accounts/utils/getAccountIcon';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export function AccountReorderView({
  theme,
  accounts,
  isLoading,
  onMove,
  onBack,
  chrome,
}: AccountReorderViewModel & { chrome: ScreenNavChrome }) {
  if (isLoading) return null;

  return (
    <ScreenWithChrome chrome={chrome} onBack={onBack}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppText variant="caption" color="secondary" style={styles.tipText}>
          Manual ordering affects all lists. Accounts are grouped by category but follow this
          sequence.
        </AppText>

        <View style={{ gap: Spacing.sm }}>
          {accounts.map((account, index) => {
            const prevAccount = accounts[index - 1];
            const showSectionHeader =
              !prevAccount || prevAccount.accountType !== account.accountType;
            const isFirstInSection =
              !prevAccount || prevAccount.accountType !== account.accountType;
            const nextAccount = accounts[index + 1];
            const isLastInSection = !nextAccount || nextAccount.accountType !== account.accountType;

            return (
              <React.Fragment key={account.id}>
                {showSectionHeader && (
                  <View style={styles.sectionHeader}>
                    <AppText variant="subheading" weight="bold" color="primary">
                      {account.accountType}
                    </AppText>
                  </View>
                )}
                <AppCard padding="none" style={styles.itemCard}>
                  <View style={styles.itemContent}>
                    <View style={styles.dragHandle}>
                      <AppIcon
                        name={getAccountIcon(account)}
                        fallbackIcon={getAccountFallbackIcon(account.accountType)}
                        color={theme.primary}
                      />
                    </View>

                    <View style={styles.accountInfo}>
                      <AppText variant="body" weight="semibold" numberOfLines={1}>
                        {account.name}
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        {account.accountType} • {account.currencyCode}
                      </AppText>
                    </View>

                    <View style={styles.actions}>
                      <TouchableOpacity
                        onPress={() => onMove(index, 'up')}
                        disabled={isFirstInSection}
                        style={[
                          styles.actionButton,
                          { backgroundColor: withOpacity(theme.text, Opacity.soft) },
                          isFirstInSection && { opacity: Opacity.muted },
                        ]}
                      >
                        <AppIcon name="chevronUp" size={20} color={theme.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => onMove(index, 'down')}
                        disabled={isLastInSection}
                        style={[
                          styles.actionButton,
                          { backgroundColor: withOpacity(theme.text, Opacity.soft) },
                          isLastInSection && { opacity: Opacity.muted },
                        ]}
                      >
                        <AppIcon name="chevronDown" size={20} color={theme.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </AppCard>
              </React.Fragment>
            );
          })}
        </View>
      </ScrollView>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.lg,
  },
  tipText: {
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  itemCard: {
    borderRadius: Shape.radius.md,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  dragHandle: {
    marginRight: Spacing.md,
  },
  sectionHeader: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  accountInfo: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionButton: {
    padding: Spacing.xs,
    borderRadius: Shape.radius.sm,
  },
});
