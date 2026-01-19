import { AppText, FloatingActionButton, SearchField } from '@/components/core';
import { NetWorthCard } from '@/components/dashboard/NetWorthCard';
import { DashboardSummary } from '@/components/journal/DashboardSummary';
import { JournalCard } from '@/components/journal/JournalCard';
import { Spacing, ThemeMode, useThemeColors } from '@/constants';
import { useUser } from '@/contexts/UIContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useJournals, useNetWorth } from '@/hooks/use-data';
import { useSummary } from '@/hooks/use-summary';
import Journal from '@/src/data/models/Journal';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export default function JournalListScreen() {
  const router = useRouter()
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()
  const { journals, isLoading } = useJournals()
  const { income, expense, isPrivacyMode } = useSummary()
  const { netWorth, totalAssets, totalLiabilities, isLoading: worthLoading } = useNetWorth()
  const [searchQuery, setSearchQuery] = React.useState('')

  const themeMode: ThemeMode = themePreference === 'system'
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode

  const theme = useThemeColors(themeMode)

  const handleJournalPress = (journal: Journal) => {
    router.push(`/transaction-details?journalId=${journal.id}` as any);
  }

  // Filter journals based on search query
  const filteredJournals = journals.filter(j => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (j.description?.toLowerCase() || '').includes(q) ||
      (j.currencyCode.toLowerCase()).includes(q)
    );
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <AppText variant="body" themeMode={themeMode}>Loading journals...</AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlashList
        data={filteredJournals}
        renderItem={({ item }) => (
          <JournalCard
            journal={item}
            themeMode={themeMode}
            onPress={handleJournalPress}
          />
        )}
        keyExtractor={(item) => item.id}
        estimatedItemSize={120}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <NetWorthCard
              netWorth={netWorth}
              totalAssets={totalAssets}
              totalLiabilities={totalLiabilities}
              themeMode={themeMode}
              isLoading={worthLoading}
            />
            <DashboardSummary
              income={income}
              expense={expense}
              isPrivacyMode={isPrivacyMode}
              themeMode={themeMode}
            />
            <SearchField
              value={searchQuery}
              onChangeText={setSearchQuery}
              themeMode={themeMode}
            />
            <AppText variant="subheading" themeMode={themeMode} style={styles.sectionTitle}>
              {searchQuery ? 'Search Results' : 'Recent Transactions'}
            </AppText>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <AppText variant="heading" themeMode={themeMode} style={styles.emptyText}>
              No transactions yet
            </AppText>
            <AppText
              variant="body"
              color="secondary"
              themeMode={themeMode}
              style={styles.emptySubtext}
            >
              Tap the + button to add your first transaction
            </AppText>
          </View>
        }
      />
      <FloatingActionButton
        onPress={() => router.push('/journal-entry' as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  listContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
  },
});