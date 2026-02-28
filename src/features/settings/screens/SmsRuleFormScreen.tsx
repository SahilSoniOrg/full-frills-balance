import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { AppCard, AppInput, AppText, ListRow } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule';
import { useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { toast } from '@/src/utils/alerts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';

export default function SmsRuleFormScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { accounts } = useAccounts();

    const [senderMatch, setSenderMatch] = useState('');
    const [bodyMatch, setBodyMatch] = useState('');
    const [sourceAccountId, setSourceAccountId] = useState('');
    const [categoryAccountId, setCategoryAccountId] = useState('');
    const [isActive, setIsActive] = useState(true);

    const [pickingAccountFor, setPickingAccountFor] = useState<'source' | 'category' | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (id) {
            const loadRule = async () => {
                try {
                    const rule = await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').find(id);
                    setSenderMatch(rule.senderMatch);
                    setBodyMatch(rule.bodyMatch || '');
                    setSourceAccountId(rule.sourceAccountId);
                    setCategoryAccountId(rule.categoryAccountId);
                    setIsActive(rule.isActive);
                } catch (e) {
                    toast.error('Failed to load rule');
                    router.back();
                }
            };
            loadRule();
        }
    }, [id, router]);

    const isValid = senderMatch.trim().length > 0 && sourceAccountId && categoryAccountId;

    const handleSave = async () => {
        if (!isValid) return;
        setIsSubmitting(true);
        try {
            await database.write(async () => {
                if (id) {
                    const rule = await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').find(id);
                    await rule.update(record => {
                        record.senderMatch = senderMatch.trim();
                        record.bodyMatch = bodyMatch.trim() || undefined;
                        record.sourceAccountId = sourceAccountId;
                        record.categoryAccountId = categoryAccountId;
                        record.isActive = isActive;
                    });
                } else {
                    await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').create(record => {
                        record.senderMatch = senderMatch.trim();
                        record.bodyMatch = bodyMatch.trim() || undefined;
                        record.sourceAccountId = sourceAccountId;
                        record.categoryAccountId = categoryAccountId;
                        record.isActive = isActive;
                    });
                }
            });
            toast.success('Rule saved');
            router.back();
        } catch (e) {
            toast.error('Failed to save rule');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        setIsSubmitting(true);
        try {
            await database.write(async () => {
                const rule = await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').find(id);
                await rule.destroyPermanently();
            });
            toast.success('Rule deleted');
            router.back();
        } catch (e) {
            toast.error('Failed to delete rule');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Screen
            title={id ? "Edit Auto-Post Rule" : "New Auto-Post Rule"}
            showBack={true}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    <View style={styles.formSection}>
                        <AppCard padding="lg">
                            <AppInput
                                label="Sender Match"
                                value={senderMatch}
                                onChangeText={setSenderMatch}
                                placeholder="E.g., SWIGGY, HDFCBK (Exact or partial)"
                            />

                            <AppInput
                                label="Body Match (Optional)"
                                value={bodyMatch}
                                onChangeText={setBodyMatch}
                                placeholder="E.g., UPI, **1234 (Exact or partial)"
                            />

                            <ListRow
                                title="Source Account"
                                subtitle={accounts.find(a => a.id === sourceAccountId)?.name || "Select paying/receiving account"}
                                onPress={() => setPickingAccountFor('source')}
                            />

                            <ListRow
                                title="Category Account"
                                subtitle={accounts.find(a => a.id === categoryAccountId)?.name || "Select expense/income category"}
                                onPress={() => setPickingAccountFor('category')}
                            />

                            <View style={styles.switchRow}>
                                <AppText>Rule Active</AppText>
                                <Switch
                                    value={isActive}
                                    onValueChange={setIsActive}
                                />
                            </View>
                        </AppCard>

                        {id && (
                            <SubmitFooter
                                label="Delete Rule"
                                onPress={handleDelete}
                                disabled={isSubmitting}
                            />
                        )}
                    </View>
                </ScrollView>

                <SubmitFooter
                    label={isSubmitting ? "Saving..." : "Save Rule"}
                    onPress={handleSave}
                    disabled={!isValid || isSubmitting}
                />
            </KeyboardAvoidingView>

            <AccountPickerModal
                visible={pickingAccountFor !== null}
                accounts={accounts as any}
                selectedId={pickingAccountFor === 'source' ? sourceAccountId : categoryAccountId}
                onClose={() => setPickingAccountFor(null)}
                onSelect={(accId: string) => {
                    if (pickingAccountFor === 'source') {
                        setSourceAccountId(accId);
                    } else {
                        setCategoryAccountId(accId);
                    }
                    setPickingAccountFor(null);
                }}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
    formSection: {
        padding: Spacing.lg,
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: Spacing.md,
    },
});
