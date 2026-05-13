import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppCard, AppText, EmptyStateView, FloatingActionButton } from '@/src/components/core';
import { Opacity, Spacing } from '@/src/constants';
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SmsRuleCardView } from '@/src/features/settings/components/SmsRuleCardView';
import type { SmsRuleSuggestion } from '@/src/services/sms-service';
import { AppNavigation } from '@/src/utils/navigation';
import React, { useCallback } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

interface SmsRulesViewProps {
  rules: SmsAutoPostRule[];
  suggestions: SmsRuleSuggestion[];
  accountMap: Map<string, string>;
}

export function SmsRulesView({ rules, suggestions, accountMap }: SmsRulesViewProps) {
  const handleRulePress = useCallback((item: SmsAutoPostRule) => {
    AppNavigation.toSmsRuleForm(item.id);
  }, []);

  const renderHeader = () => {
    if (suggestions.length === 0) return null;

    return (
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
    );
  };

  return (
    <SettingsLayout title="SMS Rules" scrollable={false} hideFooter={true}>
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
          <SmsRuleCardView item={item} accountMap={accountMap} onPress={handleRulePress} />
        )}
      />
      <FloatingActionButton
        onPress={() => AppNavigation.toSmsRuleForm()}
        label="Create Rule"
        placement="end"
        accessibilityLabel="Create a new SMS rule"
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
    padding: Spacing.md,
  },
  bodyMatch: {
    marginBottom: Spacing.sm,
  },
  suggestionsSection: {
    marginBottom: Spacing.md,
  },
  suggestionsTitle: {
    marginBottom: Spacing.sm,
  },
});
