import { AppCard, AppText } from '@/components/core'
import { TransactionItem } from '@/components/journal/TransactionItem'
import { Shape, ThemeMode, useThemeColors } from '@/constants'
import { useUser } from '@/contexts/UIContext'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { database } from '@/src/data/database/Database'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { TransactionWithAccountInfo } from '@/src/types/readModels'
import { showErrorAlert } from '@/src/utils/alerts'
import { formatDate } from '@/src/utils/dateUtils'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function TransactionDetailsScreen() {
  const router = useRouter()
  const { journalId } = useLocalSearchParams<{ journalId: string }>()
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()

  // Derive theme mode following the explicit pattern from design preview
  const themeMode: ThemeMode = themePreference === 'system'
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode

  const theme = useThemeColors(themeMode)

  const [transactions, setTransactions] = useState<TransactionWithAccountInfo[]>([]);
  const [journalInfo, setJournalInfo] = useState<{ description?: string; date: number; status: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTransactions = async () => {
      if (!journalId) {
        console.error('No journalId provided in URL parameters');
        setError('No journal ID provided');
        setIsLoading(false);
        return;
      }

      console.log('Loading transactions for journalId:', journalId);

      try {
        setIsLoading(true);
        // Use new repository-owned read model
        const journalTransactions = await transactionRepository.findByJournalWithAccountInfo(journalId);
        console.log('Found transactions:', journalTransactions.length);
        setTransactions(journalTransactions);

        // Get journal info for context
        const journal = await database.collections.get('journals').find(journalId);
        if (journal) {
          setJournalInfo({
            description: (journal as any).description,
            date: (journal as any).journalDate,
            status: (journal as any).status
          });
        }
      } catch (error) {
        console.error('Error loading transactions:', error);
        showErrorAlert(error, 'Failed to Load Transactions');
        setTransactions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadTransactions();
  }, [journalId]);

  const renderTransaction = ({ item: transaction }: { item: TransactionWithAccountInfo }) => {
    return (
      <TransactionItem
        transaction={transaction}
        themeMode={themeMode}
      />
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <AppText variant="heading" themeMode={themeMode}>Transaction Details</AppText>
        </View>
        <View style={styles.loadingContainer}>
          <AppText variant="body" themeMode={themeMode}>Loading transactions...</AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <AppText variant="heading" themeMode={themeMode}>Transaction Details</AppText>
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <AppText variant="body" themeMode={themeMode}>←</AppText>
        </TouchableOpacity>
        <AppText variant="heading" themeMode={themeMode}>Transaction Details</AppText>
        <TouchableOpacity onPress={() => router.push('/(tabs)' as any)} style={styles.contextButton}>
          <Ionicons name="list" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {journalInfo && (
        <AppCard elevation="sm" padding="md" style={styles.journalInfoCard} themeMode={themeMode}>
          <AppText variant="subheading" themeMode={themeMode}>Journal Info</AppText>
          <AppText variant="body" themeMode={themeMode}>
            {journalInfo.description || 'No description'}
          </AppText>
          <AppText variant="caption" color="secondary" themeMode={themeMode}>
            {formatDate(journalInfo.date, { includeTime: false })}
          </AppText>
          <AppText variant="caption" color="tertiary" themeMode={themeMode}>{journalInfo.status}</AppText>
        </AppCard>
      )}

      <FlatList
        data={transactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <AppText variant="body" color="secondary" themeMode={themeMode}>No transactions found</AppText>
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
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  contextButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF', // Theme color override? Should use theme
    borderRadius: Shape.radius.full,
  },
  contextButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  journalInfoCard: {
    margin: 16,
    // borderRadius handled by AppCard default (r2)
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  journalInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  journalInfoDescription: {
    fontSize: 14,
    marginBottom: 4,
    opacity: 0.8,
  },
  journalInfoDate: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 2,
  },
  journalInfoStatus: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  transactionCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  accountType: {
    fontSize: 12,
    opacity: 0.7,
  },
  transactionTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  transactionTypeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  transactionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  transactionDate: {
    fontSize: 14,
    opacity: 0.8,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  runningBalance: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  transactionNotes: {
    fontSize: 14,
    opacity: 0.8,
    fontStyle: 'italic',
    flex: 1,
    textAlign: 'right',
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
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.6,
  },
});
