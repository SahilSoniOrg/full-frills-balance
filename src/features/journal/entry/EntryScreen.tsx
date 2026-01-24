import { AppText, Badge } from '@/components/core';
import { AccountSelector } from '@/components/journal/AccountSelector';
import { Shape, Spacing, withOpacity } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import Account from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { showErrorAlert } from '@/src/utils/alerts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdvancedForm } from './components/AdvancedForm';
import { JournalEntryHeader } from './components/JournalEntryHeader';
import { JournalModeToggle } from './components/JournalModeToggle';
import { SimpleForm } from './components/SimpleForm';
import { useJournalEditor } from './hooks/useJournalEditor';

export default function EntryScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams();
  const router = useRouter();

  // Unified editor state
  const editor = useJournalEditor({
    journalId: params.journalId as string,
    initialMode: params.mode as any,
    initialType: params.type as any,
  });

  // Local UI state (not domain logic)
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const allAccounts = await accountRepository.findAll();
      setAccounts(allAccounts);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      showErrorAlert('Failed to load accounts');
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleSelectAccountRequest = (lineId: string) => {
    setActiveLineId(lineId);
    setShowAccountPicker(true);
  };

  const handleAccountSelected = (accountId: string) => {
    if (activeLineId) {
      const account = accounts.find(a => a.id === accountId);
      if (account) {
        editor.updateLine(activeLineId, {
          accountId,
          accountName: account.name,
          accountType: account.accountType,
          accountCurrency: account.currencyCode
        });
      }
    }
    setShowAccountPicker(false);
    setActiveLineId(null);
  };

  if (isLoadingAccounts) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <AppText variant="body">Loading accounts...</AppText>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <JournalEntryHeader
        title={editor.isEdit ? 'Edit Transaction' : (editor.isGuidedMode ? 'New Transaction' : 'Journal Entry')}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {editor.isEdit && (
            <View style={[styles.editBanner, { backgroundColor: withOpacity(theme.warning, 0.2) }]}>
              <Badge variant="expense" size="sm">EDITING</Badge>
              <AppText variant="caption" color="secondary" style={{ marginLeft: Spacing.sm }}>
                You are modifying an existing transaction
              </AppText>
            </View>
          )}

          <JournalModeToggle
            isGuidedMode={editor.isGuidedMode}
            setIsGuidedMode={(mode) => {
              if (mode && editor.lines.length > 2) {
                showErrorAlert('Cannot switch to Simple mode with more than 2 transaction lines.');
                return;
              }
              editor.setIsGuidedMode(mode);
            }}
          />

          {editor.isGuidedMode ? (
            <SimpleForm
              accounts={accounts}
              onSuccess={() => router.back()}
              initialType={editor.transactionType}
            />
          ) : (
            <AdvancedForm
              accounts={accounts}
              editor={editor}
              onSelectAccountRequest={handleSelectAccountRequest}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <AccountSelector
        visible={showAccountPicker}
        accounts={accounts}
        onClose={() => setShowAccountPicker(false)}
        onSelect={handleAccountSelected}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: Shape.radius.sm,
  },
});
