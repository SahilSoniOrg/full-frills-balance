import ExpoSmsInboxModule, { SmsMessage } from '@/modules/expo-sms-inbox';
import { database } from '@/src/data/database/Database';
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule';
import { TransactionType } from '@/src/data/models/Transaction';
import { journalService } from '@/src/features/journal';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';

export interface ParsedTransaction {
    id: string; // Original SMS ID
    amount: number;
    merchant: string;
    type: 'debit' | 'credit';
    date: number; // Original SMS Date timestamp
    rawBody: string;
    address: string; // Sender of the SMS
    accountSource?: string; // e.g., 'Card 1990', 'A/c XX1234', 'UPI'
    referenceNumber?: string; // e.g., UTR, Txn ID
}

class SmsService {
    private readonly PROCESSED_SMS_KEY = '@processed_sms_ids';

    /**
     * Fetches the latest SMS messages. Throws an error if on iOS.
     */
    async getLatestMessages(limit: number = 50): Promise<SmsMessage[]> {
        if (Platform.OS !== 'android') {
            throw new Error('Reading SMS is only supported on Android.');
        }

        const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
        if (!hasPermission) {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.READ_SMS,
                {
                    title: 'SMS Permission',
                    message: 'Full Frills Balance needs access to read your SMS to import transactions securely.',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );

            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                throw new Error('READ_SMS permission denied by user.');
            }
        }

        try {
            if (!ExpoSmsInboxModule) throw new Error('ExpoSmsInbox module is not available');
            return await ExpoSmsInboxModule!.getSmsInbox(limit);
        } catch (error) {
            logger.error('Failed to read SMS inbox', error);
            throw error;
        }
    }

    /**
     * Parses a raw SMS body to extract transaction details.
     * Handles common bank SMS formats.
     */
    parseTransactionMessage(sms: SmsMessage): ParsedTransaction | null {
        const text = sms.body.toLowerCase();

        // 1. Determine if it's a debit or credit
        const isDebit = text.includes('debited') || text.includes('spent') || text.includes('paid') || text.includes('txn');
        const isCredit = text.includes('credited') || text.includes('received') || text.includes('deposited');

        if (!isDebit && !isCredit) {
            logger.debug(`SMS Ignored:`, { originalBody: sms.body });
            return null; // Not a recognized transaction message
        }

        const type = isDebit ? 'debit' : 'credit';

        // 2. Extract amount (Matches Rs. 100.00, INR 1,000, Rs 500, Rs.180.00)
        // Adjust regex based on expected currencies in the app
        const amountRegex = /(?:rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i;
        const amountMatch = sms.body.match(amountRegex);
        logger.debug(`Amount Analysis:`, {
            originalBody: sms.body,
            parsedResult: amountMatch ? 'SUCCESS' : 'IGNORED',
            parsedData: amountMatch
        });

        let amount = 0;
        if (amountMatch && amountMatch[1]) {
            amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        }

        if (amount <= 0) {
            return null; // Could not parse a valid amount
        }

        // 3. Extract Merchant/Info
        // Common patterns: "to/at [Merchant]", "from [Sender]"
        let merchant = 'Unknown Merchant';

        if (isDebit) {
            // Include 'at' which often appears natively in HDFC / CC transactions
            const toAtRegex = /(?:to|at|vpa|info[:]?)\s+([a-zA-Z0-9.\s@]+?)(?:\s+(?:on|ref|by|bal)|\.|$)/i;
            const merchantMatch = sms.body.match(toAtRegex);
            if (merchantMatch && merchantMatch[1]) {
                merchant = merchantMatch[1].trim();
            }
        } else if (isCredit) {
            const fromRegex = /(?:from\s+)?([a-zA-Z0-9.\s]+?)(?:\s+on|\s+ref|\.|$)/i;
            // Try to find a 'from [Name]' pattern
            const merchantMatch = sms.body.match(fromRegex);
            if (merchantMatch && merchantMatch[1]) {
                merchant = merchantMatch[1].trim();
            }
        }

        // 4. Extract Account Source
        let accountSource: string | undefined = undefined;
        // Updated to catch stand-alone masked formats (e.g., "**1234" or "XX1234") as per the research paper
        const sourceRegex = /(?:a\/c|acct|acc|card)\s*[:\-]?\s*[*xX.-]*(\d{3,4})|by\s+(UPI)|([xX*.]{2,}[\s\-]?\d{3,5})/i;
        const sourceMatch = sms.body.match(sourceRegex);
        if (sourceMatch) {
            if (sourceMatch[1]) {
                const prefixMatch = sms.body.match(/(card)/i);
                accountSource = `${prefixMatch ? 'Card' : 'A/c'} ${sourceMatch[1]}`;
            } else if (sourceMatch[2]) {
                accountSource = 'UPI';
            } else if (sourceMatch[3]) {
                accountSource = `A/c ${sourceMatch[3].replace(/[^0-9]/g, '')}`;
            }
        }

        // 5. Extract Reference Number (UTR, Txn ID, Ref)
        let referenceNumber: string | undefined = undefined;
        const refRegex = /(?:utr|ref(?:\s*no)?|txn\s*id|transaction\s*id|cheque(?:\s*no)?)\s*[:\-]?\s*([a-zA-Z0-9]{6,22})/i;
        const refMatch = sms.body.match(refRegex);
        if (refMatch && refMatch[1]) {
            referenceNumber = refMatch[1];
        }

        return {
            id: sms.id,
            amount,
            merchant,
            type,
            date: sms.date,
            rawBody: sms.body,
            address: sms.address,
            accountSource,
            referenceNumber,
        };
    }

    /**
     * Fetches and parses recent financial SMS messages.
     */
    async getRecentTransactions(limit: number = 50): Promise<ParsedTransaction[]> {
        const messages = await this.getLatestMessages(limit);
        const processedIds = await this.getProcessedSmsIds();
        const parsedTransactions: ParsedTransaction[] = [];

        let activeRules: SmsAutoPostRule[] = [];
        try {
            activeRules = await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules')
                .query(Q.where('is_active', true))
                .fetch();
        } catch (error) {
            logger.error('Failed to fetch SMS auto-post rules', error);
        }

        logger.info(`Fetched ${messages.length} messages from device. Found ${activeRules.length} active Auto-Post rules.`);

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            // Filter out personal messages by verifying Sender ID is not a normal 10+ digit phone number
            const isPhoneNumber = /^\+?\d{10,14}$/.test(msg.address);
            if (isPhoneNumber) {
                continue;
            }

            // Skip if already processed
            if (processedIds.includes(msg.id)) {
                continue;
            }

            const parsed = this.parseTransactionMessage(msg);

            // Log first 5 messages to trace parsing behavior
            if (i < 5) {
                logger.debug(`SMS Analysis:`, {
                    originalBody: msg.body,
                    parsedResult: parsed ? 'SUCCESS' : 'IGNORED',
                    parsedData: parsed
                });
            }

            if (parsed) {
                let isAutoPosted = false;

                // 1. Process Auto-Post Rules
                if (activeRules.length > 0) {
                    for (const rule of activeRules) {
                        try {
                            const senderRegex = new RegExp(rule.senderMatch, 'i');
                            const senderMatch = senderRegex.test(msg.address);

                            let bodyMatch = true;
                            if (rule.bodyMatch) {
                                const bodyRegex = new RegExp(rule.bodyMatch, 'i');
                                bodyMatch = bodyRegex.test(msg.body);
                            }

                            if (senderMatch && bodyMatch) {
                                // Rule matches! Auto-post this journal entry.
                                logger.info(`Auto-posting SMS ${msg.id} using rule ${rule.id}`);
                                const isExpense = parsed.type === 'debit';
                                const lines = [
                                    {
                                        id: `src-${parsed.id}`,
                                        accountId: rule.sourceAccountId,
                                        accountName: '', // not strictly needed by service, just UI type
                                        accountType: 'ASSET' as any,
                                        amount: parsed.amount.toString(),
                                        transactionType: isExpense ? TransactionType.CREDIT : TransactionType.DEBIT,
                                        notes: '',
                                        exchangeRate: ''
                                    },
                                    {
                                        id: `dst-${parsed.id}`,
                                        accountId: rule.categoryAccountId,
                                        accountName: '',
                                        accountType: 'EXPENSE' as any,
                                        amount: parsed.amount.toString(),
                                        transactionType: isExpense ? TransactionType.DEBIT : TransactionType.CREDIT,
                                        notes: '',
                                        exchangeRate: ''
                                    }
                                ];

                                const description = parsed.merchant
                                    ? `Auto-Posted: ${parsed.merchant}`
                                    : 'Auto-Posted SMS Transaction';

                                await journalService.saveJournalEntry({
                                    lines,
                                    description,
                                    journalDate: parsed.date || Date.now(),
                                    smsId: parsed.id,
                                    smsSender: parsed.address,
                                    rawSmsBody: parsed.rawBody,
                                    mode: 'import'
                                });

                                await this.markSmsAsProcessed(msg.id);
                                isAutoPosted = true;
                                break; // Stop evaluating rules
                            }
                        } catch (err) {
                            logger.warn(`Rule parsing error for rule ${rule.id}`, { error: (err as Error).message });
                        }
                    }
                }

                // 2. Queue for manual review if not auto-posted
                if (!isAutoPosted) {
                    parsedTransactions.push(parsed);
                }
            }
        }

        logger.info(`Successfully parsed ${parsedTransactions.length} valid new transactions.`);
        return parsedTransactions;
    }

    /**
     * Retrieves the list of SMS IDs that have already been processed.
     */
    async getProcessedSmsIds(): Promise<string[]> {
        try {
            const data = await AsyncStorage.getItem(this.PROCESSED_SMS_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            logger.error('Failed to get processed SMS IDs', error);
            return [];
        }
    }

    /**
     * Marks an SMS ID as processed so it won't be suggested again.
     */
    async markSmsAsProcessed(smsId: string): Promise<void> {
        try {
            const processedIds = await this.getProcessedSmsIds();
            if (!processedIds.includes(smsId)) {
                processedIds.push(smsId);
                // Keep only the last 1000 to prevent unbounded growth
                if (processedIds.length > 1000) {
                    processedIds.splice(0, processedIds.length - 1000);
                }
                await AsyncStorage.setItem(this.PROCESSED_SMS_KEY, JSON.stringify(processedIds));
            }
        } catch (error) {
            logger.error('Failed to mark SMS as processed', error);
        }
    }

    async saveAutoPostRule(data: { id?: string, senderMatch: string, bodyMatch?: string, sourceAccountId: string, categoryAccountId: string, isActive: boolean }) {
        await database.write(async () => {
            if (data.id) {
                const rule = await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').find(data.id);
                await rule.update(record => {
                    record.senderMatch = data.senderMatch;
                    record.bodyMatch = data.bodyMatch;
                    record.sourceAccountId = data.sourceAccountId;
                    record.categoryAccountId = data.categoryAccountId;
                    record.isActive = data.isActive;
                });
            } else {
                await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').create(record => {
                    record.senderMatch = data.senderMatch;
                    record.bodyMatch = data.bodyMatch;
                    record.sourceAccountId = data.sourceAccountId;
                    record.categoryAccountId = data.categoryAccountId;
                    record.isActive = data.isActive;
                });
            }
        });
    }

    async deleteAutoPostRule(id: string) {
        await database.write(async () => {
            const rule = await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').find(id);
            await rule.destroyPermanently();
        });
    }
}

export const smsService = new SmsService();
