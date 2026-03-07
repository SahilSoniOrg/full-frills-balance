import { AccountPickerModal } from '@/src/components/common/AccountPickerModal'
import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow'
import { FormScreenScaffold } from '@/src/components/common/FormScreenScaffold'
import { SelectionTileList } from '@/src/components/common/SelectionTileList'
import { SubmitFooter } from '@/src/components/common/SubmitFooter'
import { AppCard, AppInput, AppText } from '@/src/components/core'
import { Spacing } from '@/src/constants'
import { useTheme } from '@/src/hooks/use-theme'
import { SmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel'
import dayjs from 'dayjs'
import React from 'react'
import { StyleSheet, Switch, View } from 'react-native'

export function SmsRuleFormView(vm: SmsRuleFormViewModel) {
  const { theme } = useTheme()
  const {
    id,
    mode,
    setMode,
    legacySenderMatch,
    setLegacySenderMatch,
    legacyBodyMatch,
    setLegacyBodyMatch,
    senderContains,
    setSenderContains,
    bodyContains,
    setBodyContains,
    merchantContains,
    setMerchantContains,
    accountSourceContains,
    setAccountSourceContains,
    direction,
    setDirection,
    currencyCode,
    setCurrencyCode,
    amountOperator,
    setAmountOperator,
    amountValue,
    setAmountValue,
    amountSecondaryValue,
    setAmountSecondaryValue,
    disposition,
    setDisposition,
    priority,
    setPriority,
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
    previewMatches,
    showAccountMapping,
  } = vm

  return (
    <>
      <FormScreenScaffold
        title={id ? 'Edit SMS Rule' : 'New SMS Rule'}
        footerSlot={(
          <SubmitFooter
            label={isSubmitting ? 'Saving...' : 'Save Rule'}
            onPress={handleSave}
            disabled={!isValid || isSubmitting}
          />
        )}
      >
        <View style={styles.formSection}>
          <AppCard padding="lg" style={styles.card}>
            <AppText variant="subheading" style={styles.sectionTitle}>Match Mode</AppText>
            <SelectionTileList
              items={[
                { id: 'builder', label: 'Rule Builder', icon: 'sparkles', color: theme.primary },
                { id: 'regex', label: 'Advanced Regex', icon: 'edit', color: theme.warning },
              ]}
              selectedId={mode}
              onSelect={(value) => setMode((value || 'builder') as 'builder' | 'regex')}
            />

            {mode === 'builder' ? (
              <View style={styles.group}>
                <AppText variant="caption" color="secondary" style={styles.helperText}>
                  Add a few simple checks. All filled conditions must match.
                </AppText>

                <AppInput
                  label="Sender Contains"
                  value={senderContains}
                  onChangeText={setSenderContains}
                  placeholder="e.g. HDFCBK"
                />
                <AppInput
                  label="Message Contains"
                  value={bodyContains}
                  onChangeText={setBodyContains}
                  placeholder="e.g. UPI"
                />
                <AppInput
                  label="Merchant Contains"
                  value={merchantContains}
                  onChangeText={setMerchantContains}
                  placeholder="e.g. SWIGGY"
                />
                <AppInput
                  label="Account Source Contains"
                  value={accountSourceContains}
                  onChangeText={setAccountSourceContains}
                  placeholder="e.g. 1234 or UPI"
                />
                <AppInput
                  label="Currency Code"
                  value={currencyCode}
                  onChangeText={setCurrencyCode}
                  autoCapitalize="characters"
                  placeholder="e.g. INR"
                />

                <AppText variant="body" weight="medium" style={styles.inlineLabel}>Direction</AppText>
                <SelectionTileList
                  items={[
                    { id: 'debit', label: 'Debit', icon: 'arrowUp', color: theme.error },
                    { id: 'credit', label: 'Credit', icon: 'arrowDown', color: theme.success },
                  ]}
                  selectedId={direction}
                  onSelect={(value) => setDirection((value || '') as '' | 'debit' | 'credit')}
                />

                <AppText variant="body" weight="medium" style={styles.inlineLabel}>Amount Filter</AppText>
                <SelectionTileList
                  items={[
                    { id: 'eq', label: 'Equals', color: theme.primary },
                    { id: 'gt', label: 'Greater Than', color: theme.primary },
                    { id: 'lt', label: 'Less Than', color: theme.primary },
                    { id: 'between', label: 'Between', color: theme.primary },
                  ]}
                  selectedId={amountOperator}
                  onSelect={(value) => setAmountOperator((value || '') as '' | 'eq' | 'gt' | 'lt' | 'between')}
                />
                {amountOperator ? (
                  <>
                    <AppInput
                      label={amountOperator === 'between' ? 'Minimum Amount' : 'Amount'}
                      value={amountValue}
                      onChangeText={setAmountValue}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                    />
                    {amountOperator === 'between' && (
                      <AppInput
                        label="Maximum Amount"
                        value={amountSecondaryValue}
                        onChangeText={setAmountSecondaryValue}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                      />
                    )}
                  </>
                ) : null}
              </View>
            ) : (
              <View style={styles.group}>
                <AppInput
                  label="Sender Match"
                  value={legacySenderMatch}
                  onChangeText={setLegacySenderMatch}
                  placeholder="Regex, e.g. SWIGGY|HDFCBK"
                />
                <AppInput
                  label="Body Match (Optional)"
                  value={legacyBodyMatch}
                  onChangeText={setLegacyBodyMatch}
                  placeholder="Regex, e.g. UPI|\\*\\*1234"
                />
                <AppText variant="caption" color="secondary" style={styles.helperText}>
                  Advanced mode uses case-insensitive regular expressions.
                </AppText>
              </View>
            )}
          </AppCard>

          <AppCard padding="lg" style={styles.card}>
            <AppText variant="subheading" style={styles.sectionTitle}>Action</AppText>
            <SelectionTileList
              items={[
                { id: 'auto_post', label: 'Auto-Post', icon: 'checkCircle', color: theme.success },
                { id: 'review', label: 'Require Review', icon: 'eye', color: theme.warning },
                { id: 'ignore', label: 'Ignore Message', icon: 'closeCircle', color: theme.textSecondary },
              ]}
              selectedId={disposition}
              onSelect={(value) => setDisposition((value || 'review') as 'auto_post' | 'review' | 'ignore')}
            />
            <AppText variant="caption" color="secondary" style={styles.helperText}>
              Auto-post creates journals immediately. Review leaves matches in the inbox. Ignore dismisses matching SMS.
            </AppText>

            <AppInput
              label="Priority"
              value={priority}
              onChangeText={setPriority}
              keyboardType="number-pad"
              placeholder="100"
            />

            {showAccountMapping ? (
              <>
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
              </>
            ) : null}

            <View style={styles.switchRow}>
              <AppText>Rule Active</AppText>
              <Switch value={isActive} onValueChange={setIsActive} />
            </View>
          </AppCard>

          {id ? (
            <SubmitFooter
              label="Delete Rule"
              onPress={handleDelete}
              disabled={isSubmitting}
            />
          ) : null}

          {previewMatches.length > 0 ? (
            <AppCard padding="lg" style={styles.card}>
              <AppText variant="subheading" style={styles.sectionTitle}>Recent Matches</AppText>
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
          ) : null}
        </View>
      </FormScreenScaffold>

      <AccountPickerModal
        visible={pickingAccountFor !== null}
        accounts={accounts}
        selectedId={pickingAccountFor === 'source' ? sourceAccountId : categoryAccountId}
        onClose={() => setPickingAccountFor(null)}
        onSelect={(accountId: string) => {
          if (pickingAccountFor === 'source') {
            setSourceAccountId(accountId)
          } else {
            setCategoryAccountId(accountId)
          }
          setPickingAccountFor(null)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  formSection: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  card: {
    gap: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
  },
  group: {
    gap: Spacing.md,
  },
  inlineLabel: {
    marginTop: Spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  helperText: {
    marginTop: Spacing.xs,
  },
  previewItem: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
})
