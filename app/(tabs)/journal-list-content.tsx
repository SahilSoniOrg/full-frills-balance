import { AppButton, AppCard, AppText } from '@/components/core';
import { Spacing, ThemeMode, useThemeColors } from '@/constants';
import { useUser } from '@/contexts/UIContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useJournals, useJournalTransactions } from '@/hooks/use-data';
import Journal from '@/src/data/models/Journal';
import { TransactionType } from '@/src/data/models/Transaction';
import { formatShortDate } from '@/src/utils/dateUtils';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalItemProps {
  journal: Journal;
  themeMode: ThemeMode;
  onPress: (journal: Journal) => void;
  onInfo: (journal: Journal, totalAmount: number, transactionCount: number) => void;
}

const JournalItem = ({ journal, themeMode, onPress, onInfo }: JournalItemProps) => {
  const { transactions, isLoading } = useJournalTransactions(journal.id);
  const theme = useThemeColors(themeMode);
  const formattedDate = formatShortDate(journal.journalDate);

  // Calculate totals from transactions reactively
  const totalAmount = transactions
    .filter(tx => tx.transactionType === TransactionType.DEBIT)
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const transactionCount = transactions.length;

  return (
    <AppCard
      elevation="sm"
      padding="lg"
      style={styles.journalCard}
      themeMode={themeMode}
    >
      <TouchableOpacity onPress={() => onPress(journal)}>
        <View style={styles.journalHeader}>
          <AppText variant="body" themeMode={themeMode} style={styles.journalDate}>
            {formattedDate}
          </AppText>
          <TouchableOpacity
            style={[styles.infoButton, { backgroundColor: theme.surfaceSecondary }]}
            onPress={(e) => {
              e.stopPropagation();
              onInfo(journal, totalAmount, transactionCount);
            }}
          >
            <AppText variant="caption" themeMode={themeMode}>ℹ️</AppText>
          </TouchableOpacity>
        </View>

        <AppText
          variant="body"
          color="secondary"
          themeMode={themeMode}
          style={styles.journalDescription}
        >
          {journal.description || 'No description'}
        </AppText>

        <View style={styles.journalFooter}>
          <AppText variant="heading" themeMode={themeMode} style={styles.journalAmount}>
            {isLoading ? '...' : totalAmount.toFixed(2)} {journal.currencyCode}
          </AppText>
          <AppText variant="caption" color="secondary" themeMode={themeMode}>
            {isLoading ? '...' : `${transactionCount} transaction${transactionCount !== 1 ? 's' : ''}`}
          </AppText>
        </View>

        <View style={styles.journalActions}>
          <AppButton
            variant="outline"
            size="sm"
            onPress={() => onPress(journal)}
            themeMode={themeMode}
          >
            View Transactions
          </AppButton>
        </View>
      </TouchableOpacity>
    </AppCard>
  );
};

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
          <JournalItem
            journal={item}
            themeMode={themeMode}
            onPress={handleJournalPress}
            onInfo={handleJournalInfo}
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