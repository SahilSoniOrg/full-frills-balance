import { AppCard, AppIcon, AppInput, AppText } from '@/src/components/core';
import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import { useTheme } from '@/src/hooks/use-theme';
import { SmsRuleFormViewModel } from '../hooks/useSmsRuleFormViewModel';
import { StyleSheet, Switch, View } from 'react-native';
import { withOpacity } from '@/src/utils/color-math';
import { Shape, Spacing } from '@/src/constants';

export function ActionSettingsSection({ vm }: { vm: SmsRuleFormViewModel }) {
  const { theme } = useTheme();
  const {
    disposition,
    setDisposition,
    priority,
    setPriority,
    sourceAccountId,
    categoryAccountId,
    journalDescription,
    setJournalDescription,
    isActive,
    setIsActive,
    setPickingAccountFor,
    accounts,
    showAccountMapping,
  } = vm;

  return (
    <FormSectionGroup title="Action">
      <SelectionTileList
        items={[
          { id: 'auto_post', label: 'Auto-Post', icon: 'checkCircle', color: theme.success },
          { id: 'review', label: 'Require Review', icon: 'eye', color: theme.warning },
          {
            id: 'ignore',
            label: 'Ignore Message',
            icon: 'closeCircle',
            color: theme.textSecondary,
          },
        ]}
        selectedId={disposition}
        onSelect={value => setDisposition((value || 'review') as 'auto_post' | 'review' | 'ignore')}
      />

      <AppCard variant="outline" paddingSize="sm" style={styles.panelCard}>
        <AppText variant="caption" color="secondary" style={styles.subHelperText}>
          Auto-post creates transactions instantly without confirmation. Require Review places
          matches in the inbox queue. Ignore dismisses matching messages silently.
        </AppText>

        <AppInput
          label="Rule Evaluation Priority"
          leftIcon="trendingUp"
          value={priority}
          onChangeText={setPriority}
          keyboardType="number-pad"
          placeholder="100"
        />

        {showAccountMapping ? (
          <>
            <View style={styles.accountSelectorPanel}>
              <AccountSelectionRow
                title="Source Account"
                accounts={accounts}
                selectedAccountId={sourceAccountId}
                placeholder="Select asset/card liability account"
                onPress={() => setPickingAccountFor('source')}
              />
              <AccountSelectionRow
                title="Category Account"
                accounts={accounts}
                selectedAccountId={categoryAccountId}
                placeholder="Select expense/income category"
                onPress={() => setPickingAccountFor('category')}
              />
            </View>

            <AppInput
              label="Custom Description / Notes Template"
              leftIcon="document"
              value={journalDescription}
              onChangeText={setJournalDescription}
              placeholder="e.g. Bought coffee from {merchant} ({ref})"
              containerStyle={{ marginTop: Spacing.sm }}
            />
            <View
              style={[
                styles.templateCallout,
                {
                  borderColor: theme.border,
                  backgroundColor: withOpacity(theme.primary, 0.04),
                },
              ]}
            >
              <AppText variant="caption" color="secondary" style={styles.templateCalloutText}>
                Supported variables:{' '}
                <AppText weight="bold" variant="caption" color="primary">
                  {'{merchant}'}
                </AppText>
                ,{' '}
                <AppText weight="bold" variant="caption" color="primary">
                  {'{amount}'}
                </AppText>
                ,{' '}
                <AppText weight="bold" variant="caption" color="primary">
                  {'{ref}'}
                </AppText>
                ,{' '}
                <AppText weight="bold" variant="caption" color="primary">
                  {'{sender}'}
                </AppText>
                . Use{' '}
                <AppText variant="caption" weight="medium" color="primary">
                  {'\n'}
                </AppText>{' '}
                for custom line breaks.
              </AppText>
            </View>
          </>
        ) : null}

        <View style={styles.switchRow}>
          <View style={styles.switchRowLabelGroup}>
            <AppIcon name="zap" size={16} color={isActive ? theme.success : theme.textSecondary} />
            <AppText variant="body" weight="medium">
              Rule Active
            </AppText>
          </View>
          <Switch value={isActive} onValueChange={setIsActive} />
        </View>
      </AppCard>
    </FormSectionGroup>
  );
}

const styles = StyleSheet.create({
  panelCard: {
    borderWidth: 1,
    borderRadius: Shape.radius.r3,
    padding: Spacing.md,
  },
  subHelperText: {
    marginBottom: Spacing.sm,
    lineHeight: 16,
  },
  accountSelectorPanel: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  templateCallout: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  templateCalloutText: {
    flex: 1,
    lineHeight: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  switchRowLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
