import { IconButton } from '@/src/components/core';
import { AppConfig, Colors, Size, Spacing } from '@/src/constants';
import { useAccounts } from '@/src/features/accounts';
import { ParsedTransaction, smsService } from '@/src/services/sms-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { AppNavigation } from '@/src/utils/navigation';
import { FlashList } from '@shopify/flash-list';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface SmsImportSheetProps {
    onClose?: () => void;
}

export const SmsImportSheet = ({ onClose }: SmsImportSheetProps) => {
    const { accounts } = useAccounts();
    const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadMessages = useCallback(async () => {
        if (Platform.OS !== 'android') return;
        setIsLoading(true);
        setError(null);
        try {
            const parsed = await smsService.getRecentTransactions(200);
            setTransactions(parsed);
        } catch (e: any) {
            if (e?.message?.toLowerCase()?.includes('permission') || e?.message?.toLowerCase()?.includes('security')) {
                setError('SMS Permission is required to read messages.');
            } else {
                setError('Failed to load SMS messages. ' + (e?.message || ''));
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // We only load when the sheet is actually opened, 
        // which a parent component could trigger. But doing it on mount of sheet content works too if it's conditionally rendered inside BottomSheet.
        loadMessages();
    }, [loadMessages]);

    const handleTransactionPress = useCallback((tx: ParsedTransaction) => {
        // Find best matching account based on SMS accountSource
        let matchedBankAccountId: string | undefined = undefined;
        let matchedCounterpartyId: string | undefined = undefined;

        if (accounts.length > 0) {
            // 1. Match Account Source (e.g., "Card 1990", "A/c 1234") -> Bank/Credit Card Account
            if (tx.accountSource) {
                const normalizedSource = tx.accountSource.toLowerCase().replace(/[^a-z0-9]/g, '');
                const numericMatch = tx.accountSource.match(/(\d{3,4})/);
                const sourceDigits = numericMatch ? numericMatch[1] : null;

                const bestAccount = accounts.find(acct => {
                    const normName = acct.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const normNotes = (acct.description || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                    // Prioritize explicit digit matches (e.g., matching '1990' in 'HDFC Card 1990')
                    if (sourceDigits && (acct.name.includes(sourceDigits) || (acct.description && acct.description.includes(sourceDigits)))) {
                        return true;
                    }

                    // Fallback to substring matching if UPI or broader name matches
                    return normName.includes(normalizedSource) || normNotes.includes(normalizedSource);
                });

                if (bestAccount) {
                    matchedBankAccountId = bestAccount.id;
                }
            }

            // 2. Match Merchant (counterparty) -> Expense/Income/Transfer Account
            if (tx.merchant && tx.merchant !== 'Unknown Merchant') {
                const normalizedMerchant = tx.merchant.toLowerCase().replace(/[^a-z0-9]/g, '');

                // Only attempt match if the merchant name has some substance
                if (normalizedMerchant.length > 2) {
                    const bestAccount = accounts.find(acct => {
                        const normName = acct.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        // Check if the merchant string is contained in the account name or vice-versa
                        return normName.includes(normalizedMerchant) || normalizedMerchant.includes(normName);
                    });

                    if (bestAccount && bestAccount.id !== matchedBankAccountId) {
                        matchedCounterpartyId = bestAccount.id;
                    }
                }
            }
        }

        // Setup routing parameters
        let type: 'expense' | 'income' | 'transfer' = tx.type === 'debit' ? 'expense' : 'income';

        // If we matched both a bank account and a counterparty, and both exist in our DB, it's a direct transfer!
        if (matchedBankAccountId && matchedCounterpartyId) {
            type = 'transfer';
        }

        const params: Record<string, string> = {
            type,
            amount: tx.amount.toString(),
            notes: `Imported from: ${tx.merchant}${tx.referenceNumber ? `\nRef: ${tx.referenceNumber}` : ''}\n\n${tx.rawBody.substring(0, 100)}...`
        };

        // Assign to Source/Destination based on debit vs credit flow
        if (tx.type === 'debit') {
            // Money leaves bank account, goes to counterparty
            if (matchedBankAccountId) params.sourceAccountId = matchedBankAccountId;
            if (matchedCounterpartyId) params.destinationAccountId = matchedCounterpartyId;
        } else {
            // Money leaves counterparty, goes to bank account
            if (matchedCounterpartyId) params.sourceAccountId = matchedCounterpartyId;
            if (matchedBankAccountId) params.destinationAccountId = matchedBankAccountId;
        }

        // Extract parameters to pre-fill the journal entry
        AppNavigation.toJournalEntry({
            smsId: tx.id,
            smsSender: tx.address,
            rawSmsBody: tx.rawBody,
            initialDate: new Date(tx.date).toISOString(),
            params
        });

        onClose?.();
    }, [onClose, accounts]);

    const handleDismissTransaction = useCallback(async (tx: ParsedTransaction) => {
        await smsService.markSmsAsProcessed(tx.id);
        setTransactions(prev => prev.filter(t => t.id !== tx.id));
    }, []);

    const handleDismissAll = useCallback(async () => {
        setIsLoading(true);
        try {
            await Promise.all(transactions.map(tx => smsService.markSmsAsProcessed(tx.id)));
            setTransactions([]);
        } finally {
            setIsLoading(false);
        }
    }, [transactions]);

    const renderItem = useCallback(({ item }: { item: ParsedTransaction }) => {
        return (
            <TouchableOpacity
                style={styles.itemContainer}
                onPress={() => handleTransactionPress(item)}
            >
                <View style={styles.itemHeader}>
                    <Text style={styles.merchant} numberOfLines={1}>{item.merchant}</Text>
                    <View style={styles.amountContainer}>
                        <Text style={[
                            styles.amount,
                            item.type === 'credit' ? styles.creditAmount : styles.debitAmount
                        ]}>
                            {item.type === 'credit' ? '+' : '-'} {CurrencyFormatter.format(item.amount, AppConfig.defaultCurrency)}
                        </Text>
                        <View style={styles.dismissBtn}>
                            <IconButton
                                name="close"
                                size={Size.iconSm}
                                iconColor={Colors.light.textSecondary}
                                onPress={() => handleDismissTransaction(item)}
                            />
                        </View>
                    </View>
                </View>
                <View style={styles.itemFooter}>
                    <Text style={styles.date}>{dayjs(item.date).format('MMM D, h:mm A')}</Text>
                    <Text style={styles.type}>{item.type.toUpperCase()}</Text>
                </View>
                <Text style={styles.bodyPreview} numberOfLines={2}>{item.rawBody}</Text>
            </TouchableOpacity>
        );
    }, [handleTransactionPress]);

    return (
        <Modal visible={true} transparent={true} animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Import from SMS</Text>
                        <View style={styles.headerActions}>
                            {transactions.length > 0 && !isLoading && (
                                <IconButton name="checkCircle" size={Size.iconSm} onPress={handleDismissAll} style={styles.headerIcon} />
                            )}
                            <IconButton name="refresh" size={Size.iconSm} onPress={loadMessages} style={styles.headerIcon} />
                            <IconButton name="error" size={Size.iconSm} onPress={onClose} style={styles.headerIcon} />
                        </View>
                    </View>

                    {isLoading ? (
                        <View style={styles.center}>
                            <ActivityIndicator color={Colors.light.primary} />
                            <Text style={styles.loadingText}>Scanning messages...</Text>
                        </View>
                    ) : error ? (
                        <View style={styles.center}>
                            <Text style={styles.errorText}>{error}</Text>
                            <TouchableOpacity style={styles.button} onPress={loadMessages}>
                                <Text style={styles.buttonText}>Retry / Grant Permission</Text>
                            </TouchableOpacity>
                        </View>
                    ) : transactions.length === 0 ? (
                        <View style={styles.center}>
                            <Text style={styles.emptyText}>No recent bank transactions found in SMS.</Text>
                        </View>
                    ) : (
                        <FlashList
                            data={transactions}
                            renderItem={renderItem}
                            contentContainerStyle={styles.listContent}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        flex: 0.8,
        backgroundColor: Colors.light.surface,
        borderTopLeftRadius: Size.lg,
        borderTopRightRadius: Size.lg,
        paddingHorizontal: Spacing.md,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.light.border,
        marginBottom: Spacing.sm,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerIcon: {
        marginLeft: Spacing.xs,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.light.text,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    loadingText: {
        marginTop: Spacing.md,
        color: Colors.light.textSecondary,
    },
    errorText: {
        color: Colors.light.error,
        textAlign: 'center',
        marginBottom: Spacing.lg,
    },
    emptyText: {
        color: Colors.light.textSecondary,
        textAlign: 'center',
    },
    button: {
        backgroundColor: Colors.light.primary,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderRadius: Size.md,
    },
    buttonText: {
        color: '#fff',
        fontWeight: '600',
    },
    listContent: {
        paddingBottom: Spacing.xl,
    },
    itemContainer: {
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.light.border,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    merchant: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.light.text,
        flex: 1,
        marginRight: Spacing.sm,
    },
    amount: {
        fontSize: 16,
        fontWeight: '700',
    },
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dismissBtn: {
        marginLeft: Spacing.xs,
    },
    debitAmount: {
        color: Colors.light.text,
    },
    creditAmount: {
        color: Colors.light.success,
    },
    itemFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    date: {
        fontSize: 14,
        color: Colors.light.textSecondary,
    },
    type: {
        fontSize: 12,
        color: Colors.light.textSecondary,
        fontWeight: '600',
        backgroundColor: Colors.light.surface,
        paddingHorizontal: Spacing.xs,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden',
    },
    bodyPreview: {
        fontSize: 14,
        color: Colors.light.textSecondary,
        fontStyle: 'italic',
    }
});
