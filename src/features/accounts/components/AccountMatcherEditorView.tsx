import {
  AppButton,
  AppIcon,
  AppInput,
  AppSegmentedControl,
  AppText,
  Icon,
  PressScaleTouchable,
} from '@/src/components/core';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import type { ScreenNavChrome } from '@/src/components/layout';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { AppConfig } from '@/src/constants/app-config';
import { Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { formatDate } from '@/src/utils/dateUtils';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { SelectableSmsText, SmsBodyPreview } from './SelectableSmsText';
import { MatcherMessageChoice } from './AccountMatcherMessageViews';
import { AccountMatcherEvidencePreview } from './AccountMatcherEvidencePreview';
import { displayPrivate } from '../helpers/displayPrivate';
import { canChooseOlderAccountMatcherMessages } from './accountMatcherPickerPlatform';
import type { AccountMatcherEditorViewModel } from '@/src/features/accounts/hooks/details/types';
import { ShowMoreButton, useShowMorePager } from './ShowMorePager';

const flowOptions = [
  { id: 'either', label: copy.flowEither },
  { id: 'incoming', label: copy.flowIncoming },
  { id: 'outgoing', label: copy.flowOutgoing },
] as const;

export function AccountMatcherEditorView({
  vm,
  chrome,
  showOverlapWarning,
  onSave,
  onResolveOverlap,
  onForget,
}: {
  vm: AccountMatcherEditorViewModel;
  chrome: ScreenNavChrome;
  showOverlapWarning: boolean;
  onSave: () => void;
  onResolveOverlap: (resolution: { keepBoth?: boolean; moveMatcherId?: string }) => void;
  onForget: () => void;
}) {
  const { theme } = useTheme();
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const messagePager = useShowMorePager(vm.messages.length, { initial: 20, step: 20 });
  const validationMessage = vm.validation.valid
    ? undefined
    : (vm.validation.error ?? copy.invalidCondition);
  const movableMatchers = useMemo(() => {
    const matches = new Map<string, string>();
    for (const overlap of vm.overlaps)
      for (const matcher of overlap.movableMatchers) {
        if (!matches.has(matcher.id)) matches.set(matcher.id, matcher.accountName);
      }
    return [...matches.entries()].map(([id, accountName]) => ({ id, accountName }));
  }, [vm.overlaps]);
  const chooseMessage = (message: AccountMatcherEditorViewModel['messages'][number]) => {
    vm.selectMessage(message);
    setIsPickerVisible(false);
  };
  const togglePicker = () => {
    messagePager.reset(20);
    setIsPickerVisible(value => !value);
  };

  return (
    <EntityFormScreen
      chrome={chrome}
      submitAction={{
        label: vm.isSaving ? copy.saving : copy.save,
        onPress: onSave,
        disabled:
          !vm.isValid || !vm.isEligible || vm.isLoading || vm.isSaving || Boolean(vm.loadError),
        requirementHint: !vm.isEligible
          ? copy.suspended
          : showOverlapWarning
            ? copy.overlapTitle
            : validationMessage,
      }}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
    >
      <View style={styles.content}>
        <View style={styles.introduction}>
          <AppText variant="body" weight="semibold" testID="account-matcher-target-account">
            {copy.targetAccount(displayPrivate(vm.privateMode, vm.accountName))}
          </AppText>
          <AppText variant="bodySmall" color="secondary">
            {copy.editorIntro}
          </AppText>
        </View>
        {!vm.accountId || vm.loadError ? (
          <AppText variant="bodySmall" color="error" accessibilityRole="alert">
            {vm.loadError || copy.loadError}
          </AppText>
        ) : null}
        {!vm.isEligible && !vm.isLoading ? (
          <AppText variant="bodySmall" color="error" accessibilityRole="alert">
            {copy.suspended}
          </AppText>
        ) : null}

        <View style={styles.section}>
          <View style={styles.patternHeader}>
            <AppText variant="subheading" style={styles.flex}>
              {copy.messagePattern}
            </AppText>
            <PressScaleTouchable
              onPress={togglePicker}
              pressScale="subtle"
              style={styles.messageAction}
              accessibilityRole="button"
              accessibilityState={{ expanded: isPickerVisible }}
              accessibilityLabel={isPickerVisible ? copy.hideMessages : copy.chooseSms}
              testID="choose-account-matcher-sms"
            >
              <AppText variant="bodySmall" color="primary" weight="medium">
                {isPickerVisible
                  ? copy.hideMessages
                  : vm.selectedExample
                    ? copy.changeExample
                    : copy.chooseSms}
              </AppText>
              <AppIcon
                name={isPickerVisible ? Icon.ChevronUp : Icon.ChevronDown}
                size={Size.iconXs}
                color={theme.primary}
              />
            </PressScaleTouchable>
          </View>
          {!vm.selectedExample && !isPickerVisible ? (
            <AppText variant="caption" color="secondary">
              {copy.exampleHint}
            </AppText>
          ) : null}
          {isPickerVisible ? (
            <View style={styles.picker}>
              <View testID="account-matcher-sms-picker">
                {vm.messages.length ? (
                  vm.messages
                    .slice(0, messagePager.visibleCount)
                    .map(message => (
                      <MatcherMessageChoice
                        key={message.id}
                        message={message}
                        privateMode={vm.privateMode}
                        onPress={() => chooseMessage(message)}
                        testID={`account-matcher-sms-${message.id}`}
                      />
                    ))
                ) : (
                  <AppText variant="bodySmall" color="secondary">
                    {copy.noMessages}
                  </AppText>
                )}
              </View>
              {messagePager.hasMore ? (
                <ShowMoreButton
                  onPress={messagePager.showMore}
                  label={copy.loadMore}
                  testID="load-more-account-matcher-sms"
                />
              ) : null}
              {canChooseOlderAccountMatcherMessages(Platform.OS) ? (
                <View style={styles.section} testID="account-matcher-older-sms-picker">
                  {vm.olderMessages.length ? (
                    <AppText variant="bodySmall" weight="medium">
                      {copy.olderMessages}
                    </AppText>
                  ) : null}
                  {vm.olderMessagesLoaded && !vm.olderMessages.length ? (
                    <AppText variant="bodySmall" color="secondary">
                      {copy.noOlderMessages}
                    </AppText>
                  ) : null}
                  {vm.olderMessages.map(message => (
                    <MatcherMessageChoice
                      key={message.id}
                      message={message}
                      privateMode={vm.privateMode}
                      onPress={() => chooseMessage(message)}
                      testID={`account-matcher-older-sms-${message.deviceSourceId}`}
                    />
                  ))}
                  {vm.isLoadingOlderMessages ? (
                    <AppText variant="caption" color="secondary">
                      {copy.loadingOlderMessages}
                    </AppText>
                  ) : null}
                  {vm.olderMessagesError ? (
                    <AppText variant="bodySmall" color="error" accessibilityRole="alert">
                      {vm.olderMessagesError}
                    </AppText>
                  ) : null}
                  {!vm.olderMessagesLoaded || vm.hasMoreOlderMessages ? (
                    <AppButton
                      variant="ghost"
                      onPress={vm.loadOlderMessages}
                      disabled={vm.isLoadingOlderMessages}
                      testID="choose-older-account-matcher-sms"
                    >
                      {vm.olderMessagesLoaded ? copy.loadOlderMessages : copy.chooseOlderMessages}
                    </AppButton>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {vm.selectedExample ? (
            <View
              style={[styles.selectedExample, { backgroundColor: theme.surfaceSecondary }]}
              testID="selected-account-matcher-example"
            >
              <AppText variant="bodySmall" weight="semibold">
                {displayPrivate(
                  vm.privateMode,
                  vm.selectedExample.senderAddress,
                  copy.unknownSender,
                )}
              </AppText>
              <AppText variant="caption" color="secondary">
                {formatDate(vm.selectedExample.inputDate, { includeTime: true })}
              </AppText>
              <View style={styles.selectedBody}>
                {vm.regexMode ? (
                  <SmsBodyPreview
                    body={vm.selectedExample.rawBody ?? ''}
                    spans={vm.selectedPreviewSpans}
                    privateMode={vm.privateMode}
                  />
                ) : (
                  <SelectableSmsText
                    key={vm.selectedExample.id}
                    body={vm.selectedExample.rawBody ?? ''}
                    selectedSpans={vm.selectedSpans}
                    onChange={vm.changeSelectedSpans}
                    privateMode={vm.privateMode}
                  />
                )}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.field}>
            <AppText variant="bodySmall" weight="medium">
              {copy.accountFlow}
            </AppText>
            <AppSegmentedControl
              options={flowOptions}
              value={vm.flow}
              onChange={vm.setFlow}
              flex
              size="lg"
              disabled={vm.isLoading || vm.isSaving || Boolean(vm.loadError)}
              testID="account-matcher-flow"
            />
            <AppText variant="caption" color="secondary">
              {vm.flow === 'incoming'
                ? copy.flowIncomingHint
                : vm.flow === 'outgoing'
                  ? copy.flowOutgoingHint
                  : copy.flowEitherHint}
            </AppText>
          </View>
          <View style={styles.field}>
            <AppText variant="bodySmall" weight="medium">
              {copy.sender}
            </AppText>
            <View style={[styles.inputLine, { borderBottomColor: theme.border }]}>
              <AppInput
                variant="minimal"
                value={vm.sender}
                onChangeText={vm.setSender}
                placeholder={copy.senderPlaceholder}
                autoCapitalize="none"
                maxLength={AppConfig.input.sms.maxSenderMatchLength}
                accessibilityLabel={copy.sender}
                testID="account-matcher-sender"
              />
            </View>
            {!vm.sender ? (
              <AppText variant="caption" color="secondary">
                {copy.senderHint}
              </AppText>
            ) : null}
          </View>
          {!vm.regexMode ? (
            <PressScaleTouchable
              onPress={() => setShowAdvanced(value => !value)}
              style={styles.tertiaryAction}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAdvanced }}
              testID="account-matcher-advanced-toggle"
            >
              <AppText variant="bodySmall" color="secondary">
                {showAdvanced ? copy.hideAdvancedConditions : copy.advancedConditions}
              </AppText>
              <AppIcon
                name={showAdvanced ? Icon.ChevronUp : Icon.ChevronDown}
                size={Size.iconXs}
                color="textSecondary"
              />
            </PressScaleTouchable>
          ) : null}
          {showAdvanced || vm.regexMode ? (
            <View style={styles.section}>
              <View style={styles.field}>
                <AppText variant="bodySmall" weight="medium">
                  {vm.regexMode ? copy.bodyRegex : copy.bodyFragments}
                </AppText>
                <View style={[styles.inputLine, { borderBottomColor: theme.border }]}>
                  {vm.regexMode ? (
                    <AppInput
                      variant="minimal"
                      value={vm.regexPattern}
                      onChangeText={vm.changeRegexPattern}
                      placeholder={copy.regexPlaceholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={200}
                      multiline
                      accessibilityLabel={copy.bodyRegex}
                      testID="account-matcher-regex"
                    />
                  ) : (
                    <AppInput
                      variant="minimal"
                      value={vm.fragmentsText}
                      onChangeText={vm.setFragmentsText}
                      placeholder={copy.fragmentPlaceholder}
                      multiline
                      maxLength={AppConfig.input.sms.maxBodyMatchLength}
                      inputStyle={styles.fragmentsInput}
                      accessibilityLabel={copy.bodyFragments}
                      testID="account-matcher-fragments"
                    />
                  )}
                </View>
                {vm.regexMode && vm.regexPattern.trim() && !vm.regexValidation.valid ? (
                  <AppText
                    variant="caption"
                    color="error"
                    accessibilityRole="alert"
                    testID="account-matcher-regex-error"
                  >
                    {vm.regexValidation.error}
                  </AppText>
                ) : !vm.regexMode ? (
                  <AppText variant="caption" color="secondary">
                    {copy.phrasesHint}
                  </AppText>
                ) : null}
              </View>
              <PressScaleTouchable
                onPress={() => {
                  setShowAdvanced(true);
                  vm.setRegexMode(!vm.regexMode);
                }}
                style={styles.tertiaryAction}
                accessibilityRole="button"
                accessibilityState={{ expanded: Boolean(vm.regexMode) }}
                testID="account-matcher-regex-toggle"
              >
                <AppText variant="bodySmall" color="secondary">
                  {vm.regexMode ? copy.useFragments : copy.useRegex}
                </AppText>
              </PressScaleTouchable>
            </View>
          ) : null}
        </View>

        <AccountMatcherEvidencePreview vm={vm} />

        {showOverlapWarning && vm.overlaps.length ? (
          <ModalSurface
            visible
            title={copy.overlapTitle}
            onClose={() => {
              if (!vm.isSaving) onResolveOverlap({});
            }}
            position="bottomSheet"
            fixedHeight={false}
          >
            <View style={styles.conflict} testID="account-matcher-overlap-warning">
              <AppText variant="bodySmall" color="secondary">
                {copy.overlapMessage}
              </AppText>
              <AppButton
                variant="secondary"
                onPress={() => onResolveOverlap({})}
                disabled={vm.isSaving}
                testID="refine-account-matcher"
              >
                {copy.refine}
              </AppButton>
              {movableMatchers.map(matcher => (
                <AppButton
                  key={matcher.id}
                  variant="ghost"
                  onPress={() => onResolveOverlap({ moveMatcherId: matcher.id })}
                  disabled={vm.isSaving}
                  testID={`move-account-matcher-${matcher.id}`}
                >
                  {copy.moveMatcher(matcher.accountName)}
                </AppButton>
              ))}
              <AppButton
                variant="primary"
                loading={vm.isSaving}
                disabled={vm.isSaving}
                onPress={() => onResolveOverlap({ keepBoth: true })}
                testID="keep-both-account-matchers"
              >
                {copy.keepBoth}
              </AppButton>
              {vm.saveError ? (
                <AppText variant="bodySmall" color="error" accessibilityRole="alert">
                  {vm.saveError}
                </AppText>
              ) : null}
            </View>
          </ModalSurface>
        ) : null}
        {vm.saveError && !showOverlapWarning ? (
          <AppText variant="bodySmall" color="error" accessibilityRole="alert">
            {vm.saveError}
          </AppText>
        ) : null}
        {vm.matcherId ? (
          <AppButton
            variant="ghost"
            onPress={() =>
              Alert.alert(copy.forgetTitle, copy.forgetMessage, [
                { text: copy.cancel, style: 'cancel' },
                { text: copy.forget, style: 'destructive', onPress: onForget },
              ])
            }
            testID="forget-account-matcher"
          >
            <AppText variant="bodySmall" color="error">
              {copy.forget}
            </AppText>
          </AppButton>
        ) : null}
      </View>
    </EntityFormScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.xxxl },
  introduction: { gap: Spacing.sm },
  section: { gap: Spacing.md },
  field: { gap: Spacing.xs },
  inputLine: { borderBottomWidth: StyleSheet.hairlineWidth },
  fragmentsInput: { minHeight: Size.textareaHeight, textAlignVertical: 'top' },
  patternHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  messageAction: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  flex: { flex: 1, minWidth: 0 },
  picker: { gap: Spacing.lg },
  selectedExample: { padding: Spacing.lg, borderRadius: Shape.radius.md, gap: Spacing.xs },
  selectedBody: { marginTop: Spacing.md },
  tertiaryAction: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  conflict: { gap: Spacing.md },
});
