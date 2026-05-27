import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { FilterChipRow } from '@/src/components/common/FilterChipRow';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import { AppInput, AppText, AppIcon, AppCard, Badge, IconName } from '@/src/components/core';
import { Shape, Spacing, Typography } from '@/src/constants';
import { SmsRuleFormViewModel } from '@/src/features/settings/hooks/useSmsRuleFormViewModel';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { withOpacity } from '@/src/utils/color-math';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useTheme } from '@/src/hooks/use-theme';

/**
 * Renders the body of the SMS with highlighted text matching current search rules
 */
function highlightSmsBody(
  text: string,
  mode: 'builder' | 'regex',
  builderQueries: string[],
  regexBodyPattern: string,
  theme: any,
) {
  if (!text)
    return (
      <AppText variant="caption" color="secondary">
        {text}
      </AppText>
    );

  let activeQueries: string[] = [];
  let regex: RegExp | null = null;

  if (mode === 'builder') {
    activeQueries = builderQueries.filter(q => q && q.trim().length > 0);
    if (activeQueries.length > 0) {
      const escaped = activeQueries.map(q => q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
      try {
        regex = new RegExp(`(${escaped.join('|')})`, 'gi');
      } catch {
        // Fallback
      }
    }
  } else if (regexBodyPattern.trim()) {
    try {
      regex = new RegExp(`(${regexBodyPattern.trim()})`, 'gi');
    } catch {
      // User is typing incomplete regex, ignore highlight
    }
  }

  if (!regex) {
    return (
      <AppText variant="caption" color="secondary">
        {text}
      </AppText>
    );
  }

  const parts = text.split(regex);
  return (
    <AppText variant="caption" color="secondary" style={styles.smsBodyText}>
      {parts.map((part, index) => {
        const isMatch = regex!.test(part);
        regex!.lastIndex = 0; // Reset state for subsequent matches

        return isMatch ? (
          <AppText
            key={index}
            variant="caption"
            weight="bold"
            style={[
              styles.highlightSpan,
              {
                backgroundColor: withOpacity(theme.primary, 0.25),
                color: theme.text,
              },
            ]}
          >
            {part}
          </AppText>
        ) : (
          part
        );
      })}
    </AppText>
  );
}

export function SmsRuleFormView(vm: SmsRuleFormViewModel) {
  const { theme } = useTheme();
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
    journalDescription,
    setJournalDescription,
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
  } = vm;

  // Resolve accounts for visualization
  const sourceAccount = useMemo(() => {
    if (!showAccountMapping || sourceAccountId === EMPTY_ACCOUNT_ID) return null;
    return accounts.find(a => a.id === sourceAccountId) || null;
  }, [accounts, sourceAccountId, showAccountMapping]);

  const categoryAccount = useMemo(() => {
    if (!showAccountMapping || categoryAccountId === EMPTY_ACCOUNT_ID) return null;
    return accounts.find(a => a.id === categoryAccountId) || null;
  }, [accounts, categoryAccountId, showAccountMapping]);

  // Construct active builder conditions list for visualization
  const activeConditions = useMemo(() => {
    const list: { label: string; icon: IconName; color: string }[] = [];
    if (mode === 'builder') {
      if (senderContains.trim()) {
        list.push({
          label: `Sender: ${senderContains.trim()}`,
          icon: 'mail',
          color: theme.primary,
        });
      }
      if (accountSourceContains.trim()) {
        list.push({
          label: `Source: ${accountSourceContains.trim()}`,
          icon: 'creditCard',
          color: theme.primary,
        });
      }
      if (bodyContains.trim()) {
        list.push({
          label: `Body: ${bodyContains.trim()}`,
          icon: 'messageSquare',
          color: theme.primary,
        });
      }
      if (merchantContains.trim()) {
        list.push({
          label: `Merchant: ${merchantContains.trim()}`,
          icon: 'tag',
          color: theme.primary,
        });
      }
      if (currencyCode.trim()) {
        list.push({
          label: `Currency: ${currencyCode.trim().toUpperCase()}`,
          icon: 'transaction',
          color: theme.primary,
        });
      }
      if (direction) {
        list.push({
          label: direction === 'debit' ? 'Debit Only' : 'Credit Only',
          icon: direction === 'debit' ? 'arrowUp' : 'arrowDown',
          color: direction === 'debit' ? theme.error : theme.success,
        });
      }
      if (amountOperator && amountValue.trim()) {
        const opLabel =
          amountOperator === 'eq'
            ? '='
            : amountOperator === 'gt'
              ? '>'
              : amountOperator === 'lt'
                ? '<'
                : 'between';
        const valText =
          amountOperator === 'between' ? `${amountValue} - ${amountSecondaryValue}` : amountValue;
        list.push({
          label: `Amount ${opLabel} ${valText}`,
          icon: 'calculator',
          color: theme.primary,
        });
      }
    } else {
      if (legacySenderMatch.trim()) {
        list.push({
          label: `Sender Regex: ${legacySenderMatch.trim()}`,
          icon: 'terminal',
          color: theme.warning,
        });
      }
      if (legacyBodyMatch.trim()) {
        list.push({
          label: `Body Regex: ${legacyBodyMatch.trim()}`,
          icon: 'terminal',
          color: theme.warning,
        });
      }
    }
    return list;
  }, [
    mode,
    senderContains,
    accountSourceContains,
    bodyContains,
    merchantContains,
    currencyCode,
    direction,
    amountOperator,
    amountValue,
    amountSecondaryValue,
    legacySenderMatch,
    legacyBodyMatch,
    theme,
  ]);

  // Visual state for the current action node
  const actionNode = useMemo(() => {
    switch (disposition) {
      case 'auto_post':
        return {
          label: 'Auto-Post',
          sub: 'Creates journal immediately',
          icon: 'zap' as const,
          color: theme.success,
          bg: withOpacity(theme.success, 0.1),
        };
      case 'ignore':
        return {
          label: 'Ignore Message',
          sub: 'Dismisses matching SMS',
          icon: 'closeCircle' as const,
          color: theme.textSecondary,
          bg: withOpacity(theme.textSecondary, 0.1),
        };
      case 'review':
      default:
        return {
          label: 'Require Review',
          sub: 'Leaves matches in Inbox',
          icon: 'eye' as const,
          color: theme.warning,
          bg: withOpacity(theme.warning, 0.1),
        };
    }
  }, [disposition, theme]);

  return (
    <>
      <EntityFormScreen
        title={id ? 'Edit SMS Rule' : 'New SMS Rule'}
        headerActions={
          id ? (
            <ScreenHeaderActions
              actions={[
                {
                  name: 'delete',
                  onPress: handleDelete,
                  iconColor: theme.error,
                  variant: 'surface',
                  disabled: isSubmitting,
                  testID: 'delete-rule-button',
                },
              ]}
            />
          ) : undefined
        }
        submitAction={{
          label: isSubmitting ? 'Saving...' : 'Save Rule',
          onPress: handleSave,
          disabled: !isValid || isSubmitting,
        }}
      >
        <View style={styles.formSection}>
          {/* Live Rule Visualizer */}
          <AppCard paddingSize="md" variant="secondary" style={styles.flowCard}>
            <View style={styles.flowCardHeader}>
              <View style={styles.flowCardHeaderTitle}>
                <AppIcon name="activity" size={16} color={theme.primary} />
                <AppText
                  variant="caption"
                  weight="bold"
                  color="secondary"
                  style={{ letterSpacing: 1 }}
                >
                  LIVE RULE FLOW PREVIEW
                </AppText>
              </View>
              <Badge variant={isActive ? 'success' : 'default'} size="sm">
                {isActive ? 'Active' : 'Inactive'}
              </Badge>
            </View>

            <View style={styles.flowContainer}>
              {/* Step 1: Conditions */}
              <View style={styles.flowStep}>
                <View style={styles.flowStepIndicator}>
                  <View style={[styles.stepDot, { backgroundColor: theme.primary }]} />
                  <View style={[styles.stepLine, { backgroundColor: theme.border }]} />
                </View>
                <View style={styles.flowStepContent}>
                  <AppText
                    variant="caption"
                    color="secondary"
                    weight="semibold"
                    style={styles.stepTitle}
                  >
                    WHEN SMS ARRIVES MATCHING
                  </AppText>
                  {activeConditions.length > 0 ? (
                    <View style={styles.chipGrid}>
                      {activeConditions.map((cond, index) => (
                        <View
                          key={index}
                          style={[
                            styles.flowChip,
                            {
                              backgroundColor: withOpacity(cond.color, 0.08),
                              borderColor: withOpacity(cond.color, 0.15),
                            },
                          ]}
                        >
                          <AppIcon name={cond.icon} size={12} color={cond.color} />
                          <AppText variant="caption" weight="medium" style={{ color: cond.color }}>
                            {cond.label}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={[styles.emptyDashedBox, { borderColor: theme.border }]}>
                      <AppText variant="caption" color="secondary" italic>
                        Define search parameters below to see flow triggering
                      </AppText>
                    </View>
                  )}
                </View>
              </View>

              {/* Step 2: Ingestion Action */}
              <View style={styles.flowStep}>
                <View style={styles.flowStepIndicator}>
                  <View style={[styles.stepDot, { backgroundColor: actionNode.color }]} />
                  {disposition !== 'ignore' ? (
                    <View style={[styles.stepLine, { backgroundColor: theme.border }]} />
                  ) : null}
                </View>
                <View style={styles.flowStepContent}>
                  <AppText
                    variant="caption"
                    color="secondary"
                    weight="semibold"
                    style={styles.stepTitle}
                  >
                    THEN EXECUTE INGESTION ACTION
                  </AppText>
                  <View
                    style={[
                      styles.actionBadgeLarge,
                      {
                        backgroundColor: actionNode.bg,
                        borderColor: withOpacity(actionNode.color, 0.2),
                      },
                    ]}
                  >
                    <AppIcon name={actionNode.icon} size={16} color={actionNode.color} />
                    <View>
                      <AppText variant="caption" weight="bold" style={{ color: theme.text }}>
                        {actionNode.label}
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        {actionNode.sub}
                      </AppText>
                    </View>
                  </View>
                </View>
              </View>

              {/* Step 3: Ledger Outcome */}
              {disposition !== 'ignore' ? (
                <View style={styles.flowStepEnd}>
                  <View style={styles.flowStepIndicator}>
                    <View
                      style={[
                        styles.stepDot,
                        {
                          backgroundColor:
                            sourceAccount && categoryAccount
                              ? theme.success
                              : disposition === 'auto_post'
                                ? theme.error
                                : theme.textSecondary,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.flowStepContent}>
                    <AppText
                      variant="caption"
                      color="secondary"
                      weight="semibold"
                      style={styles.stepTitle}
                    >
                      MAP DOUBLE-ENTRY JOURNAL
                    </AppText>
                    <View style={styles.ledgerFlowContainer}>
                      {/* Source Account card */}
                      <View
                        style={[
                          styles.ledgerAccountBox,
                          sourceAccount
                            ? {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                              }
                            : {
                                backgroundColor: 'transparent',
                                borderColor:
                                  disposition === 'auto_post' ? theme.error : theme.border,
                                borderStyle: 'dashed',
                              },
                        ]}
                      >
                        <AppIcon
                          name="creditCard"
                          size={12}
                          color={sourceAccount ? theme.primary : theme.textSecondary}
                        />
                        <AppText
                          variant="caption"
                          weight={sourceAccount ? 'semibold' : 'regular'}
                          numberOfLines={1}
                          style={{
                            color: sourceAccount ? theme.text : theme.textSecondary,
                            flexShrink: 1,
                          }}
                        >
                          {sourceAccount ? sourceAccount.name : 'Select Source Account...'}
                        </AppText>
                      </View>

                      {/* Direction flow connector */}
                      <View style={styles.ledgerFlowArrow}>
                        <AppIcon name="arrowRight" size={14} color={theme.textSecondary} />
                      </View>

                      {/* Category Account card */}
                      <View
                        style={[
                          styles.ledgerAccountBox,
                          categoryAccount
                            ? {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                              }
                            : {
                                backgroundColor: 'transparent',
                                borderColor:
                                  disposition === 'auto_post' ? theme.error : theme.border,
                                borderStyle: 'dashed',
                              },
                        ]}
                      >
                        <AppIcon
                          name="tag"
                          size={12}
                          color={categoryAccount ? theme.primary : theme.textSecondary}
                        />
                        <AppText
                          variant="caption"
                          weight={categoryAccount ? 'semibold' : 'regular'}
                          numberOfLines={1}
                          style={{
                            color: categoryAccount ? theme.text : theme.textSecondary,
                            flexShrink: 1,
                          }}
                        >
                          {categoryAccount ? categoryAccount.name : 'Select Category...'}
                        </AppText>
                      </View>
                    </View>

                    {disposition === 'auto_post' && (!sourceAccount || !categoryAccount) ? (
                      <AppText variant="caption" color="error" style={styles.errorText}>
                        * Both accounts must be specified for Auto-Post rules
                      </AppText>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          </AppCard>

          <FormSectionGroup title="Match Mode">
            <SelectionTileList
              items={[
                { id: 'builder', label: 'Rule Builder', icon: 'sparkles', color: theme.primary },
                { id: 'regex', label: 'Advanced Regex', icon: 'edit', color: theme.warning },
              ]}
              selectedId={mode}
              onSelect={value => setMode((value || 'builder') as 'builder' | 'regex')}
            />

            <AppCard variant="outline" paddingSize="sm" style={styles.panelCard}>
              {mode === 'builder' ? (
                <View style={styles.group}>
                  <AppText variant="caption" color="secondary" style={styles.subHelperText}>
                    Specify string matching filters. Leave a field blank to ignore it. All populated
                    criteria must be satisfied to trigger a match.
                  </AppText>

                  <View style={styles.inputRow}>
                    <View style={styles.inputCol}>
                      <AppInput
                        label="Sender Contains"
                        leftIcon="mail"
                        value={senderContains}
                        onChangeText={setSenderContains}
                        placeholder="e.g. HDFCBK"
                        autoCapitalize="characters"
                      />
                    </View>
                    <View style={styles.inputCol}>
                      <AppInput
                        label="Account Ref Contains"
                        leftIcon="creditCard"
                        value={accountSourceContains}
                        onChangeText={setAccountSourceContains}
                        placeholder="e.g. 1234 or UPI"
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={styles.inputCol}>
                      <AppInput
                        label="Message Contains"
                        leftIcon="messageSquare"
                        value={bodyContains}
                        onChangeText={setBodyContains}
                        placeholder="e.g. UPI"
                      />
                    </View>
                    <View style={styles.inputCol}>
                      <AppInput
                        label="Merchant Contains"
                        leftIcon="tag"
                        value={merchantContains}
                        onChangeText={setMerchantContains}
                        placeholder="e.g. SWIGGY"
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={styles.inputCol}>
                      <AppInput
                        label="Currency Code"
                        leftIcon="transaction"
                        value={currencyCode}
                        onChangeText={setCurrencyCode}
                        autoCapitalize="characters"
                        placeholder="e.g. INR"
                      />
                    </View>
                    <View style={styles.inputCol} />
                  </View>

                  <AppText variant="caption" weight="medium" style={styles.inlineLabel}>
                    Direction
                  </AppText>
                  <FilterChipRow
                    items={[
                      {
                        id: 'debit',
                        label: 'Debit (Expense)',
                        icon: 'arrowUp',
                        color: theme.error,
                      },
                      {
                        id: 'credit',
                        label: 'Credit (Income)',
                        icon: 'arrowDown',
                        color: theme.success,
                      },
                    ]}
                    selectedId={direction}
                    onSelect={value => setDirection((value || '') as '' | 'debit' | 'credit')}
                  />

                  <AppText variant="caption" weight="medium" style={styles.inlineLabel}>
                    Amount Filter
                  </AppText>
                  <FilterChipRow
                    items={[
                      { id: 'eq', label: 'Equals', color: theme.primary },
                      { id: 'gt', label: 'Greater Than', color: theme.primary },
                      { id: 'lt', label: 'Less Than', color: theme.primary },
                      { id: 'between', label: 'Between', color: theme.primary },
                    ]}
                    selectedId={amountOperator}
                    onSelect={value =>
                      setAmountOperator((value || '') as '' | 'eq' | 'gt' | 'lt' | 'between')
                    }
                  />
                  {amountOperator ? (
                    amountOperator === 'between' ? (
                      <View style={styles.inputRow}>
                        <View style={styles.inputCol}>
                          <AppInput
                            label="Minimum Amount"
                            leftIcon="calculator"
                            value={amountValue}
                            onChangeText={setAmountValue}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                          />
                        </View>
                        <View style={styles.inputCol}>
                          <AppInput
                            label="Maximum Amount"
                            leftIcon="calculator"
                            value={amountSecondaryValue}
                            onChangeText={setAmountSecondaryValue}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                          />
                        </View>
                      </View>
                    ) : (
                      <AppInput
                        label="Amount"
                        leftIcon="calculator"
                        value={amountValue}
                        onChangeText={setAmountValue}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                      />
                    )
                  ) : null}
                </View>
              ) : (
                <View style={styles.group}>
                  {/* Warning/Info Callout */}
                  <View
                    style={[
                      styles.alertCallout,
                      {
                        borderColor: theme.warning,
                        backgroundColor: withOpacity(theme.warning, 0.05),
                      },
                    ]}
                  >
                    <AppIcon name="alert" size={16} color={theme.warning} />
                    <AppText variant="caption" color="secondary" style={styles.calloutText}>
                      Regular expressions are compiled as case-insensitive, global patterns. Ensure
                      special regex syntax characters (e.g. *, +, ?, $) are correctly escaped.
                    </AppText>
                  </View>

                  <AppInput
                    label="Sender Match Regex"
                    leftIcon="terminal"
                    value={legacySenderMatch}
                    onChangeText={setLegacySenderMatch}
                    placeholder="e.g. SWIGGY|HDFCBK"
                  />
                  <AppInput
                    label="Body Match Regex (Optional)"
                    leftIcon="terminal"
                    value={legacyBodyMatch}
                    onChangeText={setLegacyBodyMatch}
                    placeholder="e.g. UPI|\\*\\*1234"
                  />
                </View>
              )}
            </AppCard>
          </FormSectionGroup>

          <FormSectionGroup title="Action">
            <SelectionTileList
              items={[
                { id: 'auto_post', label: 'Auto-Post', icon: 'checkCircle', color: theme.success },
                { id: 'review', label: 'Require Review', icon: 'eye', color: theme.warning },
                {
                  id: 'ignore',
                  label: 'Ignore Message',
                  icon: 'closeCircle',
                  color: theme.textSecondary,
                },
              ]}
              selectedId={disposition}
              onSelect={value =>
                setDisposition((value || 'review') as 'auto_post' | 'review' | 'ignore')
              }
            />

            <AppCard variant="outline" paddingSize="sm" style={styles.panelCard}>
              <AppText variant="caption" color="secondary" style={styles.subHelperText}>
                Auto-post creates transactions instantly without confirmation. Require Review places
                matches in the inbox queue. Ignore dismisses matching messages silently.
              </AppText>

              <AppInput
                label="Rule Evaluation Priority"
                leftIcon="trendingUp"
                value={priority}
                onChangeText={setPriority}
                keyboardType="number-pad"
                placeholder="100"
              />

              {showAccountMapping ? (
                <>
                  <View style={styles.accountSelectorPanel}>
                    <AccountSelectionRow
                      title="Source Account"
                      accounts={accounts}
                      selectedAccountId={sourceAccountId}
                      placeholder="Select asset/card liability account"
                      onPress={() => setPickingAccountFor('source')}
                    />
                    <AccountSelectionRow
                      title="Category Account"
                      accounts={accounts}
                      selectedAccountId={categoryAccountId}
                      placeholder="Select expense/income category"
                      onPress={() => setPickingAccountFor('category')}
                    />
                  </View>

                  <AppInput
                    label="Custom Description / Notes Template"
                    leftIcon="document"
                    value={journalDescription}
                    onChangeText={setJournalDescription}
                    placeholder="e.g. Bought coffee from {merchant} ({ref})"
                    containerStyle={{ marginTop: Spacing.sm }}
                  />
                  <View
                    style={[
                      styles.templateCallout,
                      {
                        borderColor: theme.border,
                        backgroundColor: withOpacity(theme.primary, 0.04),
                      },
                    ]}
                  >
                    <AppText variant="caption" color="secondary" style={styles.templateCalloutText}>
                      Supported variables:{' '}
                      <AppText weight="bold" variant="caption" color="primary">
                        {'{merchant}'}
                      </AppText>
                      ,{' '}
                      <AppText weight="bold" variant="caption" color="primary">
                        {'{amount}'}
                      </AppText>
                      ,{' '}
                      <AppText weight="bold" variant="caption" color="primary">
                        {'{ref}'}
                      </AppText>
                      ,{' '}
                      <AppText weight="bold" variant="caption" color="primary">
                        {'{sender}'}
                      </AppText>
                      . Use{' '}
                      <AppText variant="caption" weight="medium" color="primary">
                        {'\n'}
                      </AppText>{' '}
                      for custom line breaks.
                    </AppText>
                  </View>
                </>
              ) : null}

              <View style={styles.switchRow}>
                <View style={styles.switchRowLabelGroup}>
                  <AppIcon
                    name="zap"
                    size={16}
                    color={isActive ? theme.success : theme.textSecondary}
                  />
                  <AppText variant="body" weight="medium">
                    Rule Active
                  </AppText>
                </View>
                <Switch value={isActive} onValueChange={setIsActive} />
              </View>
            </AppCard>
          </FormSectionGroup>

          {previewMatches.length > 0 ? (
            <FormSectionGroup title="Recent Matches">
              {previewMatches.map(match => {
                const isCredit = match.direction === 'credit';
                const directionColor = isCredit ? theme.success : theme.error;

                return (
                  <AppCard
                    key={match.id}
                    variant="outline"
                    paddingSize="sm"
                    style={styles.mockSmsCard}
                  >
                    {/* Chat Bubble Header */}
                    <View style={styles.mockSmsHeader}>
                      <View style={styles.mockSmsSenderInfo}>
                        <View
                          style={[styles.avatarCircle, { backgroundColor: theme.surfaceSecondary }]}
                        >
                          <AppText variant="caption" weight="bold">
                            {(match.senderAddress || 'U')[0].toUpperCase()}
                          </AppText>
                        </View>
                        <View>
                          <AppText variant="caption" weight="bold">
                            {match.senderAddress || 'Unknown Origin'}
                          </AppText>
                          <AppText variant="caption" color="secondary" style={styles.smsTimestamp}>
                            {dayjs(match.inputDate).format('MMM D, YYYY · h:mm A')}
                          </AppText>
                        </View>
                      </View>

                      <Badge
                        variant={isCredit ? 'success' : 'default'}
                        size="sm"
                        style={{ alignSelf: 'center' }}
                      >
                        {isCredit ? 'Incoming' : 'Outgoing'}
                      </Badge>
                    </View>

                    {/* Chat Bubble Body */}
                    <View
                      style={[
                        styles.smsBubbleContainer,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                    >
                      {highlightSmsBody(
                        match.rawBody || '',
                        mode,
                        [senderContains, bodyContains, merchantContains, accountSourceContains],
                        legacyBodyMatch,
                        theme,
                      )}
                    </View>

                    {/* Post-Ingestion Outcome Visualizer */}
                    <View style={[styles.outcomeContainer, { borderTopColor: theme.border }]}>
                      <View style={styles.outcomeHeader}>
                        <AppText variant="caption" color="secondary" weight="semibold">
                          PREVIEW OUTCOME:
                        </AppText>

                        <AppText variant="body" weight="bold" style={{ color: directionColor }}>
                          {match.parsedAmount != null
                            ? `${isCredit ? '+' : '-'} ${CurrencyFormatter.format(
                                match.parsedAmount,
                                match.parsedCurrencyCode || 'INR',
                              )}`
                            : 'Amount Unresolved'}
                        </AppText>
                      </View>

                      {disposition === 'ignore' ? (
                        <View style={styles.dismissedBanner}>
                          <AppIcon name="closeCircle" size={14} color={theme.textSecondary} />
                          <AppText variant="caption" color="secondary" italic>
                            Silent dismissal. SMS will be discarded from inbox.
                          </AppText>
                        </View>
                      ) : (
                        <View style={styles.ingestionBadgeRow}>
                          <View
                            style={[
                              styles.miniAccountBadge,
                              { backgroundColor: theme.surface, borderColor: theme.border },
                            ]}
                          >
                            <AppIcon
                              name="creditCard"
                              size={10}
                              color={sourceAccount ? theme.primary : theme.textSecondary}
                            />
                            <AppText
                              variant="caption"
                              weight={sourceAccount ? 'semibold' : 'regular'}
                              style={[
                                styles.miniBadgeText,
                                { color: sourceAccount ? theme.text : theme.textSecondary },
                              ]}
                            >
                              {sourceAccount ? sourceAccount.name : 'Missing Source'}
                            </AppText>
                          </View>

                          <AppIcon name="arrowRight" size={10} color={theme.textSecondary} />

                          <View
                            style={[
                              styles.miniAccountBadge,
                              { backgroundColor: theme.surface, borderColor: theme.border },
                            ]}
                          >
                            <AppIcon
                              name="tag"
                              size={10}
                              color={categoryAccount ? theme.primary : theme.textSecondary}
                            />
                            <AppText
                              variant="caption"
                              weight={categoryAccount ? 'semibold' : 'regular'}
                              style={[
                                styles.miniBadgeText,
                                { color: categoryAccount ? theme.text : theme.textSecondary },
                              ]}
                            >
                              {categoryAccount ? categoryAccount.name : 'Missing Category'}
                            </AppText>
                          </View>
                        </View>
                      )}
                    </View>
                  </AppCard>
                );
              })}
            </FormSectionGroup>
          ) : null}
        </View>
      </EntityFormScreen>

      <AccountPickerModal
        visible={pickingAccountFor !== null}
        accounts={accounts}
        selectedId={pickingAccountFor === 'source' ? sourceAccountId : categoryAccountId}
        onClose={() => setPickingAccountFor(null)}
        onSelect={(accountId: AccountId) => {
          if (pickingAccountFor === 'source') {
            setSourceAccountId(sourceAccountId === accountId ? EMPTY_ACCOUNT_ID : accountId);
          } else {
            setCategoryAccountId(categoryAccountId === accountId ? EMPTY_ACCOUNT_ID : accountId);
          }
          setPickingAccountFor(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  formSection: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  group: {
    gap: Spacing.md,
  },
  inlineLabel: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  switchRowLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subHelperText: {
    marginBottom: Spacing.sm,
    lineHeight: Typography.lineHeights.normal * Typography.sizes.xs,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  inputCol: {
    flex: 1,
  },
  panelCard: {
    borderWidth: 1,
    borderRadius: Shape.radius.r3,
    padding: Spacing.md,
  },
  alertCallout: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  calloutText: {
    flex: 1,
    lineHeight: 16,
  },

  // Visualizer Card
  flowCard: {
    borderRadius: Shape.radius.r2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  flowCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  flowCardHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  flowContainer: {
    gap: Spacing.none,
  },
  flowStep: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  flowStepEnd: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  flowStepIndicator: {
    width: 16,
    alignItems: 'center',
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: Spacing.full,
    marginTop: 4,
    zIndex: 10,
  },
  stepLine: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  flowStepContent: {
    flex: 1,
    paddingBottom: Spacing.lg,
  },
  stepTitle: {
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  flowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  emptyDashedBox: {
    padding: Spacing.sm,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.xs,
  },
  actionBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  ledgerFlowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  ledgerAccountBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  ledgerFlowArrow: {
    width: 24,
    alignItems: 'center',
  },
  errorText: {
    marginTop: Spacing.sm,
  },
  accountSelectorPanel: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Mock SMS bubble styling
  mockSmsCard: {
    borderRadius: Shape.radius.r3,
    borderWidth: 1,
  },
  mockSmsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  mockSmsSenderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: Spacing.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smsTimestamp: {
    fontSize: Typography.sizes.xs - 2,
    marginTop: 2,
  },
  smsBubbleContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Shape.radius.r4,
    borderTopLeftRadius: Shape.radius.xs,
    marginBottom: Spacing.md,
  },
  smsBodyText: {
    lineHeight: 18,
  },
  highlightSpan: {
    paddingHorizontal: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },

  // Post Ingestion Outcome styling
  outcomeContainer: {
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
  },
  outcomeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  dismissedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: Shape.radius.xs,
  },
  ingestionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  miniAccountBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  miniBadgeText: {
    fontSize: Typography.sizes.xs - 1,
    flexShrink: 1,
  },
  templateCallout: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  templateCalloutText: {
    flex: 1,
    lineHeight: 16,
  },
});
