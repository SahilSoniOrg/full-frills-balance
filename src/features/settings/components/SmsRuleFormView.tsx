import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { FormScreenScaffold } from '@/src/components/common/FormScreenScaffold';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { AppCard, AppInput, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { SmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, Switch, View } from 'react-native';

export function SmsRuleFormView(vm: SmsRuleFormViewModel) {
    const {
        id,
        senderMatch,
        setSenderMatch,
        bodyMatch,
        setBodyMatch,
        sourceAccountId,
        setSourceAccountId,
        categoryAccountId,
        setCategoryAccountId,
        isActive,
        setIsActive,
        pickingAccountFor,
        setPickingAccountFor,
        isSubmitting,
        isValid,
        handleSave,
        handleDelete,
        accounts,
        previewMatches
    } = vm;

    return (
        <>
            <FormScreenScaffold
                title={id ? "Edit Auto-Post Rule" : "New Auto-Post Rule"}
                footerSlot={
                    <SubmitFooter
                        label={isSubmitting ? "Saving..." : "Save Rule"}
                        onPress={handleSave}
                        disabled={!isValid || isSubmitting}
                    />
                }
            >
                <View style={styles.formSection}>
                    <AppCard padding="lg">
                        <AppInput
                            label="Sender Match"
                            value={senderMatch}
                            onChangeText={setSenderMatch}
                            placeholder="Regex, e.g. SWIGGY|HDFCBK"
                        />

                        <AppInput
                            label="Body Match (Optional)"
                            value={bodyMatch}
                            onChangeText={setBodyMatch}
                            placeholder="Regex, e.g. UPI|\\*\\*1234"
                        />

                        <AppText variant="caption" color="secondary" style={styles.helperText}>
                            Match fields use case-insensitive regular expressions.
                        </AppText>

                        <AccountSelectionRow
                            title="Source Account"
                            accounts={accounts}
                            selectedAccountId={sourceAccountId}
                            placeholder="Select paying/receiving account"
                            onPress={() => setPickingAccountFor('source')}
                        />

                        <AccountSelectionRow
                            title="Category Account"
                            accounts={accounts}
                            selectedAccountId={categoryAccountId}
                            placeholder="Select expense/income category"
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

                    {previewMatches.length > 0 && (
                        <AppCard padding="lg">
                            <AppText variant="subheading" style={styles.previewTitle}>Recent Matches</AppText>
                            {previewMatches.map((match) => (
                                <View key={match.id} style={styles.previewItem}>
                                    <AppText variant="body">{match.parsedMerchant || match.senderAddress}</AppText>
                                    <AppText variant="caption" color="secondary">
                                        {dayjs(match.smsDate).format('MMM D, h:mm A')}
                                    </AppText>
                                    <AppText variant="caption" color="secondary" numberOfLines={2}>
                                        {match.rawBody}
                                    </AppText>
                                </View>
                            ))}
                        </AppCard>
                    )}
                </View>
            </FormScreenScaffold>

            <AccountPickerModal
                visible={pickingAccountFor !== null}
                accounts={accounts}
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
        </>
    );
}

const styles = StyleSheet.create({
    content: {
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
    helperText: {
        marginTop: Spacing.xs,
        marginBottom: Spacing.md,
    },
    previewTitle: {
        marginBottom: Spacing.sm,
    },
    previewItem: {
        marginTop: Spacing.sm,
        gap: Spacing.xs,
    },
});
