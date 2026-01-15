import { AppButton, AppCard, AppText } from '@/components/core';
import { ThemeMode, useThemeColors } from '@/constants';
import { useUser } from '@/contexts/UIContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { journalRepository, JournalWithTransactionTotals } from '@/src/data/repositories/JournalRepository';
import { showErrorAlert } from '@/src/utils/alerts';
import { formatShortDate } from '@/src/utils/dateUtils';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface JournalWithAmount {
  id: string;
  journalDate: number;
  description?: string;
  currencyCode: string;
  status: string;
  createdAt: Date;
  totalAmount: string;
  transactionCount?: number;
}

export default function JournalListScreen() {
  const router = useRouter()
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()
  
  // Derive theme mode following the explicit pattern from design preview
  const themeMode: ThemeMode = themePreference === 'system' 
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode
  
  const theme = useThemeColors(themeMode)
  
  const [journals, setJournals] = useState<JournalWithTransactionTotals[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadJournalsWithTotals = async () => {
      try {
        const journalsWithTotals = await journalRepository.findAllWithTransactionTotals();
        setJournals(journalsWithTotals);
      } catch (error) {
        console.error('Error loading journals:', error);
        showErrorAlert(error, 'Failed to Load Journals');
        setJournals([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadJournalsWithTotals();
  }, []);

  const handleCreateJournal = () => {
    router.push('/journal-entry' as any)
  }

  const handleJournalPress = (journal: JournalWithTransactionTotals) => {
    // Primary action: view transactions (natural flow)
    router.push(`/transaction-details?journalId=${journal.id}` as any);
  }

  const handleJournalInfo = (journal: JournalWithTransactionTotals) => {
    const formattedDate = formatShortDate(journal.journalDate);
    const message = `Date: ${formattedDate}\nDescription: ${journal.description || 'No description'}\nCurrency: ${journal.currencyCode}\nStatus: ${journal.status}\nTransactions: ${journal.transactionCount}\nTotal Amount: ${journal.totalAmount.toFixed(2)}`;
    
    alert(`Journal Entry\n\n${message}`);
  }

  const handleViewTransactions = (journal: JournalWithTransactionTotals) => {
    router.push(`/transaction-details?journalId=${journal.id}` as any);
  }

  const renderJournal = ({ item: journal }: { item: JournalWithTransactionTotals }) => {
    const formattedDate = formatShortDate(journal.journalDate);
    
    return (
      <AppCard 
        elevation="sm" 
        padding="lg" 
        style={styles.journalCard} 
        themeMode={themeMode}
      >
        <TouchableOpacity onPress={() => handleJournalPress(journal)}>
          <View style={styles.journalHeader}>
            <AppText variant="body" themeMode={themeMode} style={styles.journalDate}>
              {formattedDate}
            </AppText>
            <TouchableOpacity 
              style={[styles.infoButton, { backgroundColor: theme.surfaceSecondary }]}
              onPress={(e) => {
                e.stopPropagation();
                handleJournalInfo(journal);
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
              {journal.totalAmount.toFixed(2)} {journal.currencyCode}
            </AppText>
            <AppText variant="caption" color="secondary" themeMode={themeMode}>
              {journal.transactionCount} transaction{journal.transactionCount !== 1 ? 's' : ''}
            </AppText>
          </View>
          
          <View style={styles.journalActions}>
            <AppButton
              variant="outline"
              size="sm"
              onPress={() => handleViewTransactions(journal)}
              themeMode={themeMode}
            >
              View Transactions
            </AppButton>
          </View>
        </TouchableOpacity>
      </AppCard>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <AppText variant="heading" themeMode={themeMode}>Journal Entries</AppText>
        </View>
        <View style={styles.loadingContainer}>
          <AppText variant="body" themeMode={themeMode}>Loading journals...</AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <AppText variant="heading" themeMode={themeMode}>Journal Entries</AppText>
        </View>
        <View style={styles.errorContainer}>
          <AppText variant="body" color="error" themeMode={themeMode}>{error}</AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <AppText variant="heading" themeMode={themeMode}>Journal Entries</AppText>
        <AppButton
          variant="outline"
          size="sm"
          onPress={handleCreateJournal}
          themeMode={themeMode}
        >
          + New Journal
        </AppButton>
      </View>
      
      <FlatList
        data={journals}
        renderItem={renderJournal}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <AppText variant="subheading" themeMode={themeMode} style={styles.emptyText}>
              No journal entries found
            </AppText>
            <AppText 
              variant="body" 
              color="secondary" 
              themeMode={themeMode}
              style={styles.emptySubtext}
            >
              Create your first journal entry to get started
            </AppText>
          </View>
        }
      />
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    paddingHorizontal: 32,
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