import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import type { ScreenNavChrome } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { SmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { StyleSheet, View } from 'react-native';

import { ActionSettingsSection } from './ActionSettingsSection';
import { MatchModeSection } from './MatchModeSection';
import { RecentMatchesSection } from './RecentMatchesSection';
import { RuleFlowPreview } from './RuleFlowPreview';

export function SmsRuleFormView(vm: SmsRuleFormViewModel & { chrome: ScreenNavChrome }) {
  const {
    chrome,
    sourceAccountId,
    setSourceAccountId,
    categoryAccountId,
    setCategoryAccountId,
    pickingAccountFor,
    setPickingAccountFor,
    isSubmitting,
    isValid,
    handleSave,
    accounts,
  } = vm;

  return (
    <>
      <EntityFormScreen
        chrome={chrome}
        submitAction={{
          label: isSubmitting ? 'Saving...' : 'Save Rule',
          onPress: handleSave,
          disabled: !isValid || isSubmitting,
        }}
      >
        <View style={styles.formSection}>
          <RuleFlowPreview vm={vm} />
          <MatchModeSection vm={vm} />
          <ActionSettingsSection vm={vm} />
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
