import { AppText, Icon } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import type { ScreenNavChrome } from '@/src/components/layout';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode, withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useAccounts } from '@/src/hooks/useAccounts';
import { WorkplaceBoundScreen } from '@/src/navigation/WorkplaceBoundScreen';
import { getEligibleMatcherAccountIds } from '@/src/services/accounts/accountMatcherEligibility';
import { asAccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AccountMatchersSection } from '../components/AccountMatchersSection';
import { displayPrivate } from '../helpers/displayPrivate';

/** Recognition has its own lifecycle and saves independently from the Account form. */
function AccountMatcherManagementScreen() {
  const params = useLocalSearchParams<{ accountId?: string | string[] }>();
  const rawAccountId = Array.isArray(params.accountId) ? params.accountId[0] : params.accountId;
  const accountId = rawAccountId ? asAccountId(rawAccountId) : EMPTY_ACCOUNT_ID;
  const { workplaceId } = useWorkplace();
  const { accounts, isLoading, error } = useAccounts(workplaceId);
  const privateMode = useEffectivePrivacyMode();
  const account = accounts.find(item => item.id === accountId);
  const eligible = getEligibleMatcherAccountIds(accounts).has(accountId);
  const chrome: ScreenNavChrome = {
    kind: 'nav',
    screenTitle: copy.sectionTitle,
    backIcon: Icon.Back,
    onBack: AppNavigation.back,
  };

  return (
    <WorkplaceBoundScreen>
      <ScreenWithChrome chrome={chrome} scrollable testID="account-matcher-management-screen">
        <View style={styles.introduction}>
          {account ? (
            <AppText variant="subheading" accessibilityRole="header">
              {displayPrivate(privateMode, account.name)}
            </AppText>
          ) : null}
          <AppText variant="bodySmall" color="secondary">
            {error
              ? copy.loadError
              : isLoading
                ? copy.loadingMatchers
                : !account
                  ? copy.accountUnavailable
                  : copy.managementHint}
          </AppText>
        </View>
        {account ? (
          <AccountMatchersSection
            key={`${workplaceId}:${accountId}`}
            accountId={accountId}
            eligible={eligible}
          />
        ) : null}
      </ScreenWithChrome>
    </WorkplaceBoundScreen>
  );
}

export default withPrivacyScope(AccountMatcherManagementScreen);

const styles = StyleSheet.create({
  introduction: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
});
