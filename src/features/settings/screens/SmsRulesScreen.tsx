import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppCard, AppText, EmptyStateView, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Spacing } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { database } from '@/src/data/database/Database';
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule';
import { useAccounts } from '@/src/features/accounts';
import { SmsRuleCard } from '@/src/features/settings/components/SmsRuleCard';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { SmsRuleSuggestion, smsService } from '@/src/services/sms-service';
import { AppNavigation } from '@/src/utils/navigation';
import { Q } from '@nozbe/watermelondb';
import { withObservables } from '@nozbe/watermelondb/react';
import React from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { from } from 'rxjs';
import { WorkplaceId } from '@/src/types/domain';

interface Props {
  rules: SmsAutoPostRule[];
}

function SmsRulesList({ rules }: Props) {
  const { theme } = useTheme();
  const { workplaceId } = useWorkplace();
  const { accounts } = useAccounts(workplaceId);
  const accountMap = new Map(accounts.map(account => [account.id, account.name]));
  const { data: suggestions = [] } = useObservable(
    () => from(smsService.getRuleSuggestions(workplaceId)),
    [workplaceId, rules.length],
    [] as SmsRuleSuggestion[],
  );

  if (rules.length === 0) {
    return (
      <FlatList
        data={[]}
        keyExtractor={(_, index) => `empty-${index}`}
        ListHeaderComponent={
          <>
            {suggestions.length > 0 && (
              <View style={styles.suggestionsSection}>
                <ScreenSectionHeader title="Suggested Rules" style={styles.suggestionsTitle} />
                {suggestions.map(suggestion => (
                  <AppCard
                    key={`${suggestion.senderMatch}-${suggestion.categoryAccountId}`}
                    elevation="sm"
                    style={styles.card}
                  >
                    <AppText variant="body" weight="semibold">
                      {suggestion.senderMatch}
                    </AppText>
                    <AppText variant="caption" color="secondary" style={styles.bodyMatch}>
                      {suggestion.bodyMatch
                        ? `Contains: ${suggestion.bodyMatch}`
                        : 'No body filter'}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {suggestion.sourceAccountName} → {suggestion.categoryAccountName}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      Based on {suggestion.sampleCount} imported messages
                    </AppText>
                    <TouchableOpacity
                      activeOpacity={Opacity.heavy}
                      onPress={() => AppNavigation.toSmsRuleForm(undefined, suggestion)}
                    >
                      <AppText
                        variant="caption"
                        style={{ color: theme.primary, marginTop: Spacing.sm }}
                      >
                        Use suggestion
                      </AppText>
                    </TouchableOpacity>
                  </AppCard>
                ))}
              </View>
            )}
            <EmptyStateView
              title="No Auto-Post Rules"
              subtitle="Automatically post journal entries when matching SMS messages are received."
            />
          </>
        }
        renderItem={() => null}
      />
    );
  }

  return (
    <FlatList
      data={rules}
      keyExtractor={r => r.id}
      ListHeaderComponent={
        suggestions.length > 0 ? (
          <View style={styles.suggestionsSection}>
            <ScreenSectionHeader title="Suggested Rules" style={styles.suggestionsTitle} />
            {suggestions.map(suggestion => (
              <TouchableOpacity
                key={`${suggestion.senderMatch}-${suggestion.categoryAccountId}`}
                activeOpacity={Opacity.heavy}
                onPress={() => AppNavigation.toSmsRuleForm(undefined, suggestion)}
              >
                <AppCard elevation="sm" style={styles.card}>
                  <AppText variant="body" weight="semibold">
                    {suggestion.senderMatch}
                  </AppText>
                  <AppText variant="caption" color="secondary" style={styles.bodyMatch}>
                    {suggestion.bodyMatch ? `Contains: ${suggestion.bodyMatch}` : 'No body filter'}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {suggestion.sourceAccountName} → {suggestion.categoryAccountName}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    Based on {suggestion.sampleCount} imported messages
                  </AppText>
                </AppCard>
              </TouchableOpacity>
            ))}
          </View>
        ) : null
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <SmsRuleCard item={item} theme={theme} accountMap={accountMap} />}
    />
  );
}

const EnhancedSmsRulesList = withObservables(
  ['workplaceId'],
  ({ workplaceId }: { workplaceId: WorkplaceId }) => ({
    rules: database.collections
      .get<SmsAutoPostRule>('sms_auto_post_rules')
      .query(Q.where('workplace_id', workplaceId))
      .observe(),
  }),
)(SmsRulesList);

export default function SmsRulesScreen() {
  const { workplaceId } = useWorkplace();
  return (
    <Screen title="SMS Rules" showBack={true} scrollable={false}>
      <EnhancedSmsRulesList workplaceId={workplaceId} />
      <FloatingActionButton
        onPress={() => AppNavigation.toSmsRuleForm()}
        label="Create Rule"
        placement="end"
        accessibilityLabel="Create a new SMS rule"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  bodyMatch: {
    marginBottom: Spacing.sm,
  },
  accountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  suggestionsSection: {
    marginBottom: Spacing.md,
  },
  suggestionsTitle: {
    marginBottom: Spacing.sm,
  },
});
