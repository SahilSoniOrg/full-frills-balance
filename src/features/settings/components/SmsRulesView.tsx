import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppCard, AppText, EmptyStateView } from '@/src/components/core';
import type { ScreenFabChrome } from '@/src/components/layout/screenChrome';
import { Opacity, Spacing } from '@/src/constants';
import { PlainSmsRule } from '@/src/types/domain';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SmsRuleCardView } from '@/src/features/settings/components/SmsRuleCardView';
import type { SmsRuleSuggestion } from '@/src/services/sms/SmsRuleEngine';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

interface SmsRulesViewProps {
  rules: PlainSmsRule[];
  suggestions: SmsRuleSuggestion[];
  accountMap: Map<string, string>;
  fab?: ScreenFabChrome;
  onOpenRule: (item: PlainSmsRule) => void;
  onOpenSuggestion: (suggestion: SmsRuleSuggestion) => void;
}

export function SmsRulesView({
  rules,
  suggestions,
  accountMap,
  fab,
  onOpenRule,
  onOpenSuggestion,
}: SmsRulesViewProps) {
  const renderHeader = () => {
    if (suggestions.length === 0) return null;

    return (
      <View style={styles.suggestionsSection}>
        <ScreenSectionHeader title="Suggested Rules" style={styles.suggestionsTitle} />
        {suggestions.map(suggestion => (
          <TouchableOpacity
            key={`${suggestion.senderMatch}-${suggestion.categoryAccountId}`}
            activeOpacity={Opacity.heavy}
            onPress={() => onOpenSuggestion(suggestion)}
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
    );
  };

  return (
    <SettingsLayout title="SMS Rules" fab={fab} scrollable={false} hideFooter>
      <FlatList
        data={rules}
        keyExtractor={r => r.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          rules.length === 0 ? (
            <EmptyStateView
              title="No Auto-Post Rules"
              subtitle="Automatically post journal entries when matching SMS messages are received."
            />
          ) : null
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SmsRuleCardView item={item} accountMap={accountMap} onPress={onOpenRule} />
        )}
      />
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  card: {
    marginBottom: Spacing.md,
  },
  suggestionsSection: {
    marginBottom: Spacing.lg,
  },
  suggestionsTitle: {
    marginBottom: Spacing.sm,
  },
  bodyMatch: {
    marginTop: Spacing.xs,
  },
});
