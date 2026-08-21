import { ModalSurface } from '@/src/components/common/ModalSurface';
import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { Shape, Spacing, Typography } from '@/src/constants/design-tokens';
import { AccountPickerModal, useAccounts } from '@/src/features/accounts';
import { useTheme } from '@/src/hooks/use-theme';
import {
  checkJournalAccountEditEligibility,
  JournalAccountEditEligibility,
} from '@/src/services/journal/bulk';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

export interface BulkChangeJournalAccountModalProps {
  visible: boolean;
  workplaceId: WorkplaceId;
  journalIds: JournalId[];
  onClose: () => void;
  onSelectAccount: (targetLeg: 'debit' | 'credit', accountId: AccountId) => Promise<void> | void;
}

function BulkChangeJournalAccountModalContent({
  workplaceId,
  journalIds,
  onClose,
  onSelectAccount,
}: Omit<BulkChangeJournalAccountModalProps, 'visible'>) {
  const { theme, fonts } = useTheme();
  const { accounts } = useAccounts(workplaceId);
  const [loading, setLoading] = useState(true);
  const [eligibility, setEligibility] = useState<JournalAccountEditEligibility | null>(null);
  const [activeLegForPicker, setActiveLegForPicker] = useState<'debit' | 'credit' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    checkJournalAccountEditEligibility(workplaceId, journalIds)
      .then(res => {
        if (isMounted) {
          setEligibility(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workplaceId, journalIds]);

  const handleAccountChosen = useCallback(
    async (accountId: AccountId) => {
      if (!activeLegForPicker) return;
      const leg = activeLegForPicker;
      setIsSubmitting(true);
      setActiveLegForPicker(null);
      try {
        await onSelectAccount(leg, accountId);
        onClose();
      } catch {
        // The parent callback owns error presentation; keep this modal available for retry.
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeLegForPicker, onSelectAccount, onClose],
  );

  return (
    <>
      <ModalSurface
        visible={!activeLegForPicker && !isSubmitting}
        onClose={onClose}
        title="Change Account"
        fixedHeight={false}
        scrollable={true}
        footer={
          <View style={styles.footerRow}>
            <AppButton variant="outline" onPress={onClose} style={styles.button}>
              Cancel
            </AppButton>
          </View>
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText style={[styles.loadingText, { color: theme.textSecondary }]}>
              Checking transaction structure...
            </AppText>
          </View>
        ) : !eligibility ? (
          <View style={styles.emptyContainer}>
            <AppText style={{ color: theme.textTertiary }}>Unable to inspect transactions.</AppText>
          </View>
        ) : (
          <View>
            <AppText style={[styles.infoText, { color: theme.textSecondary }]}>
              Select which side of the transactions you want to change:
            </AppText>

            {/* Destination Account (Debit) Option */}
            <TouchableOpacity
              disabled={!eligibility.canEditDebit}
              onPress={() => setActiveLegForPicker('debit')}
              style={[
                styles.optionCard,
                {
                  backgroundColor: theme.surfaceSecondary,
                  borderColor: theme.border,
                  opacity: eligibility.canEditDebit ? 1 : 0.5,
                },
              ]}
            >
              <View style={styles.optionHeader}>
                <AppIcon
                  name="arrowRight"
                  size={20}
                  color={eligibility.canEditDebit ? theme.primary : theme.textTertiary}
                />
                <View style={styles.optionTextContainer}>
                  <AppText
                    style={[
                      styles.optionTitle,
                      {
                        fontFamily: fonts.semibold,
                        color: eligibility.canEditDebit ? theme.text : theme.textTertiary,
                      },
                    ]}
                  >
                    Change Destination Account (Debit)
                  </AppText>
                  <AppText style={[styles.optionDesc, { color: theme.textSecondary }]}>
                    {eligibility.canEditDebit
                      ? 'All selected transactions have exactly 1 destination account.'
                      : 'Cannot change: some selected transactions have multiple debit legs.'}
                  </AppText>
                </View>
              </View>
            </TouchableOpacity>

            {/* Source Account (Credit) Option */}
            <TouchableOpacity
              disabled={!eligibility.canEditCredit}
              onPress={() => setActiveLegForPicker('credit')}
              style={[
                styles.optionCard,
                {
                  backgroundColor: theme.surfaceSecondary,
                  borderColor: theme.border,
                  opacity: eligibility.canEditCredit ? 1 : 0.5,
                },
              ]}
            >
              <View style={styles.optionHeader}>
                <AppIcon
                  name="arrowLeft"
                  size={20}
                  color={eligibility.canEditCredit ? theme.primary : theme.textTertiary}
                />
                <View style={styles.optionTextContainer}>
                  <AppText
                    style={[
                      styles.optionTitle,
                      {
                        fontFamily: fonts.semibold,
                        color: eligibility.canEditCredit ? theme.text : theme.textTertiary,
                      },
                    ]}
                  >
                    Change Source Account (Credit)
                  </AppText>
                  <AppText style={[styles.optionDesc, { color: theme.textSecondary }]}>
                    {eligibility.canEditCredit
                      ? 'All selected transactions have exactly 1 source account.'
                      : 'Cannot change: some selected transactions have multiple credit legs.'}
                  </AppText>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ModalSurface>

      {activeLegForPicker ? (
        <AccountPickerModal
          visible
          accounts={accounts}
          onClose={() => setActiveLegForPicker(null)}
          onSelect={handleAccountChosen}
          title={`Select New ${activeLegForPicker === 'debit' ? 'Destination' : 'Source'} Account`}
        />
      ) : null}
    </>
  );
}

export function BulkChangeJournalAccountModal(props: BulkChangeJournalAccountModalProps) {
  const { visible } = props;
  if (!visible) return null;
  return <BulkChangeJournalAccountModalContent {...props} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.sizes.sm,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  infoText: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.md,
  },
  optionCard: {
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
  },
  optionDesc: {
    fontSize: Typography.sizes.xs,
  },
  footerRow: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  button: {
    width: '100%',
  },
});
