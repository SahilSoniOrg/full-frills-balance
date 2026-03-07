import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { FormScreenWrapper } from '@/src/components/common/FormScreenWrapper';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { AppCard, AppInput, AppText, ListRow } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { SmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel';
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
        accounts
    } = vm;

    return (
        <Screen
            title={id ? "Edit Auto-Post Rule" : "New Auto-Post Rule"}
            showBack={true}
        >
            <FormScreenWrapper
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
                            subtitle={accounts.find((a: any) => a.id === sourceAccountId)?.name || "Select paying/receiving account"}
                            onPress={() => setPickingAccountFor('source')}
                        />

                        <ListRow
                            title="Category Account"
                            subtitle={accounts.find((a: any) => a.id === categoryAccountId)?.name || "Select expense/income category"}
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
            </FormScreenWrapper>

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
