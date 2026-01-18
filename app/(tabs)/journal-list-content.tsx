import { AppText, FloatingActionButton } from '@/components/core';
import { JournalCard } from '@/components/journal/JournalCard';
import { Spacing, ThemeMode, useThemeColors } from '@/constants';
import { useUser } from '@/contexts/UIContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useJournals } from '@/hooks/use-data';
import Journal from '@/src/data/models/Journal';
import { formatShortDate } from '@/src/utils/dateUtils';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

// JournalItem replaced by JournalCard

export default function JournalListScreen() {
  const router = useRouter()
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()
  const { journals, isLoading } = useJournals()

  const themeMode: ThemeMode = themePreference === 'system'
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode

  const theme = useThemeColors(themeMode)

  const handleJournalPress = (journal: Journal) => {
    router.push(`/transaction-details?journalId=${journal.id}` as any);
  }

  const handleJournalInfo = (journal: Journal, totalAmount: number, transactionCount: number) => {
    const formattedDate = formatShortDate(journal.journalDate);
    const message = `Date: ${formattedDate}\nDescription: ${journal.description || 'No description'}\nCurrency: ${journal.currencyCode}\nStatus: ${journal.status}\nTransactions: ${transactionCount}\nTotal Amount: ${totalAmount.toFixed(2)}`;

    alert(`Journal Entry\n\n${message}`);
  }

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
      <FlatList
        data={journals}
        renderItem={({ item }) => (
          <JournalCard
            journal={item}
            themeMode={themeMode}
            onPress={handleJournalPress}
          />
        )}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  createButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  journalCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  journalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  journalDate: {
    fontSize: 16,
    fontWeight: '600',
  },
  journalStatus: {
    fontSize: 12,
    opacity: 0.7,
  },
  infoButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  infoButtonText: {
    fontSize: 12,
  },
  journalDescription: {
    fontSize: 16,
    opacity: 0.8,
    marginBottom: 8,
  },
  journalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  journalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  transactionCount: {
    fontSize: 12,
    opacity: 0.6,
  },
  journalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
  },
  viewTransactionsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  viewTransactionsButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    color: 'red',
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