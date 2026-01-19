import { AppCard, AppText, Badge } from '@/components/core'
import { Spacing } from '@/constants'
import { useTheme } from '@/hooks/use-theme'
import { database } from '@/src/data/database/Database'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { TransactionWithAccountInfo } from '@/src/types/readModels'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import { formatDate } from '@/src/utils/dateUtils'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Reusable info row component
const InfoRow = ({ label, value }: { label: string, value: string }) => (
  <View style={styles.infoRow}>
    <AppText variant="caption" color="secondary" style={{ width: 100 }}>{label}</AppText>
    <AppText variant="body" style={{ flex: 1, textAlign: 'right' }}>{value}</AppText>
  </View>
);

export default function TransactionDetailsScreen() {
  const router = useRouter()
  const { journalId } = useLocalSearchParams<{ journalId: string }>()
  const { theme, themeMode } = useTheme()

  const [transactions, setTransactions] = useState<TransactionWithAccountInfo[]>([]);
  const [journalInfo, setJournalInfo] = useState<{ description?: string; date: number; status: string; currency: string; displayType?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTransactions = async () => {
      if (!journalId) return;
      try {
        setIsLoading(true);
        const journal = await database.collections.get('journals').find(journalId);
        const journalTransactions = await transactionRepository.findByJournalWithAccountInfo(journalId);

        setTransactions(journalTransactions);
        if (journal) {
          // Type casting safely
          const j = journal as any;
          setJournalInfo({
            description: j.description,
            date: j.journalDate,
            status: j.status,
            currency: j.currencyCode,
            displayType: j.displayType
          });
        }
      } catch (error) {
        console.error('Error loading details:', error);
        setError('Failed to load transaction details.');
      } finally {
        setIsLoading(false);
      }
    };
    loadTransactions();
  }, [journalId]);

  // Calculate total amount for the header (sum of credits or debits?)
  // Usually header shows the main amount. Let's assume Debits = Credits, split by total magnitude / 2 if needed, 
  // or just show the largest single transaction amount? 
  // Ideally: Sum of Top-Level Splits.
  // Simpler: Just sum all debits.
  const totalAmount = transactions
    .filter(t => t.transactionType === 'DEBIT')
    .reduce((sum: number, t: TransactionWithAccountInfo) => sum + (t.amount || 0), 0);

  const formattedDate = journalInfo ? formatDate(journalInfo.date, { includeTime: true }) : '';

  if (isLoading) return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.center}><AppText variant="body">Loading...</AppText></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header / Nav */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
          <Ionicons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
        <AppText variant="subheading">Transaction Details</AppText>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/journal-entry', params: { journalId } })}
          style={styles.navButton}
        >
          <Ionicons name="create-outline" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Receipt Card */}
          <AppCard elevation="md" radius="r2" padding="lg" style={styles.receiptCard}>

            {/* Big Icon */}
            <View style={styles.iconContainer}>
              <View style={[styles.bigIcon, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="receipt" size={32} color={theme.primary} />
              </View>
            </View>

            {/* Amount & Title */}
            <View style={styles.headerSection}>
              <AppText variant="title" style={{ fontSize: 32, marginBottom: 8 }}>
                {CurrencyFormatter.format(totalAmount, journalInfo?.currency)}
              </AppText>
              <AppText variant="body" color="secondary">
                {journalInfo?.description || 'No description'}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Badge variant={journalInfo?.status === 'POSTED' ? 'income' : 'expense'} size="sm">
                  {journalInfo?.status}
                </Badge>
                {journalInfo?.displayType && (
                  <Badge variant="default" size="sm">
                    {journalInfo.displayType}
                  </Badge>
                )}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Metadata List */}
            <View style={styles.infoSection}>
              <InfoRow label="Date" value={formattedDate} />
              <InfoRow label="Journal ID" value={journalId?.substring(0, 8) || '...'} />
              <TouchableOpacity
                style={styles.historyLink}
                onPress={() => router.push(`/audit-log?entityType=journal&entityId=${journalId}` as any)}
              >
                <AppText variant="caption" color="secondary" style={{ width: 100 }}>History</AppText>
                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                  <AppText variant="body" color="primary">View Edit History</AppText>
                  <Ionicons name="chevron-forward" size={14} color={theme.primary} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* Splits / Breakdown */}
            <AppText variant="caption" color="secondary" style={{ marginBottom: 12 }}>
              BREAKDOWN
            </AppText>

            {transactions.map(item => (
              <View key={item.id} style={styles.splitRow}>
                <View style={styles.splitInfo}>
                  <AppText variant="body">{item.accountName}</AppText>
                  <AppText variant="caption" color="secondary">{item.transactionType}</AppText>
                </View>
                <AppText variant="subheading">
                  {CurrencyFormatter.format(item.amount, journalInfo?.currency)}
                </AppText>
              </View>
            ))}

          </AppCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  navButton: {
    padding: Spacing.xs,
  },
  scrollContent: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  receiptCard: {
    // Flex 1 not needed, let it grow with content? Or maybe fill screen?
    // Ivy usually has a card overlay or modal.
    width: '100%',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
  },
  bigIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: Spacing.lg,
  },
  infoSection: {
    gap: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyLink: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  splitInfo: {
    flex: 1,
  }
});
