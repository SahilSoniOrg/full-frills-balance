import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { SmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/src/hooks/use-theme';
import { Spacing } from '@/src/constants';

import { RuleFlowPreview } from './RuleFlowPreview';
import { MatchModeSection } from './MatchModeSection';
import { ActionSettingsSection } from './ActionSettingsSection';
import { RecentMatchesSection } from './RecentMatchesSection';

export function SmsRuleFormView(vm: SmsRuleFormViewModel) {
  const { theme } = useTheme();
  const {
    id,
    sourceAccountId,
    setSourceAccountId,
    categoryAccountId,
    setCategoryAccountId,
    pickingAccountFor,
    setPickingAccountFor,
    isSubmitting,
    isValid,
    handleSave,
    handleDelete,
    accounts,
  } = vm;

  return (
    <>
      <EntityFormScreen
        title={id ? 'Edit SMS Rule' : 'New SMS Rule'}
        headerActions={
          id ? (
            <ScreenHeaderActions
              actions={[
                {
                  name: 'delete',
                  onPress: handleDelete,
                  iconColor: theme.error,
                  variant: 'surface',
                  disabled: isSubmitting,
                  testID: 'delete-rule-button',
                },
              ]}
            />
          ) : undefined
        }
        submitAction={{
          label: isSubmitting ? 'Saving...' : 'Save Rule',
          onPress: handleSave,
          disabled: !isValid || isSubmitting,
        }}
      >
        <View style={styles.formSection}>
          {/* 1. Live Rule Visualizer */}
          <RuleFlowPreview vm={vm} />

          {/* 2. Match Criteria Builder */}
          <MatchModeSection vm={vm} />

          {/* 3. Ingestion Action & Account Mapping */}
          <ActionSettingsSection vm={vm} />

          {/* 4. Match preview log */}
          <RecentMatchesSection vm={vm} />
        </View>
      </EntityFormScreen>

      <AccountPickerModal
        visible={pickingAccountFor !== null}
        accounts={accounts}
        selectedId={pickingAccountFor === 'source' ? sourceAccountId : categoryAccountId}
        onClose={() => setPickingAccountFor(null)}
        onSelect={(accountId: AccountId) => {
          if (pickingAccountFor === 'source') {
            setSourceAccountId(sourceAccountId === accountId ? EMPTY_ACCOUNT_ID : accountId);
          } else {
            setCategoryAccountId(categoryAccountId === accountId ? EMPTY_ACCOUNT_ID : accountId);
          }
          setPickingAccountFor(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  formSection: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
});
