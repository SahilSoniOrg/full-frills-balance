import { AppButton, AppIcon, AppText, FilterChipButton } from '@/src/components/core';
import { Size, Spacing, Typography } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Box, Stack, usePageKeyboard } from '@/src/design-system';
import { KeyboardAwareScrollView } from '@/src/design-system/KeyboardAwareScrollView';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { useState, type ReactNode } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { CollectedRow, type CollectedItem } from './CollectedRow';
import { OnboardingFadePanel } from './OnboardingFadePanel';

export interface ConversationOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
}

export function ConversationStep({
  title,
  subtitle,
  children,
  primaryLabel = copy.continue,
  primaryTestID = 'onboarding-continue-button',
  onPrimary,
  primaryDisabled,
  primaryLoading,
  skipLabel,
  onSkip,
  onBack,
  backDisabled,
  validationMessage,
  recovery,
  footer,
  centerContent = false,
  secondaryActionsDirection,
}: {
  readonly title?: string;
  readonly subtitle?: string;
  readonly children?: ReactNode;
  readonly primaryLabel?: string;
  readonly primaryTestID?: string;
  readonly onPrimary?: () => void;
  readonly primaryDisabled?: boolean;
  readonly primaryLoading?: boolean;
  readonly skipLabel?: string;
  readonly onSkip?: () => void;
  readonly onBack: () => void;
  readonly backDisabled?: boolean;
  readonly validationMessage?: string | null;
  readonly recovery?: ReactNode;
  readonly footer?: ReactNode;
  readonly centerContent?: boolean;
  readonly secondaryActionsDirection?: 'row' | 'column';
}) {
  const { isKeyboardVisible } = usePageKeyboard();
  const actionDirection = secondaryActionsDirection ?? (isKeyboardVisible ? 'row' : 'column');
  const secondaryActions = (
    <Stack direction={actionDirection} gap="xs">
      {onSkip ? (
        <Box flex={actionDirection === 'row' ? 1 : undefined}>
          <AppButton
            variant="ghost"
            size="md"
            onPress={() => {
              Keyboard.dismiss();
              onSkip();
            }}
            disabled={primaryLoading}
            testID="onboarding-skip"
          >
            {skipLabel ?? copy.addLater}
          </AppButton>
        </Box>
      ) : null}
      <Box flex={actionDirection === 'row' ? 1 : undefined}>
        <AppButton
          variant="ghost"
          size="md"
          onPress={onBack}
          disabled={primaryLoading || backDisabled}
        >
          {copy.back}
        </AppButton>
      </Box>
    </Stack>
  );
  const heading = title ? (
    <Stack gap="sm" align="center">
      <AppText
        variant="title"
        align="center"
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={styles.title}
      >
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="body" color="secondary" style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </Stack>
  ) : null;

  return (
    <Box flex={1} minHeight={0}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <OnboardingFadePanel style={centerContent ? styles.fillPanel : undefined}>
          {centerContent ? (
            <Stack flex={1} paddingTop={title ? 'xl' : 'sm'}>
              {heading}
              <Box flex={1} justifyContent="center">
                <Stack gap="lg">{children}</Stack>
              </Box>
            </Stack>
          ) : (
            <Stack gap="lg" paddingTop={title ? 'xl' : 'sm'}>
              {heading}
              {children}
            </Stack>
          )}
        </OnboardingFadePanel>
      </KeyboardAwareScrollView>
      <Box background="background" borderTopWidth={1} borderColor="border" paddingTop="sm">
        <Stack gap="xs">
          {validationMessage ? (
            <AppText variant="body" color="error" accessibilityRole="alert">
              {validationMessage}
            </AppText>
          ) : null}
          {recovery}
          {footer}
          {onPrimary ? (
            <AppButton
              variant="primary"
              size="lg"
              onPress={() => {
                Keyboard.dismiss();
                onPrimary();
              }}
              disabled={primaryDisabled || primaryLoading}
              loading={primaryLoading}
              testID={primaryTestID}
              style={{ width: '100%' }}
            >
              {primaryLabel}
            </AppButton>
          ) : null}
          {secondaryActions}
        </Stack>
      </Box>
    </Box>
  );
}

/** Type chips scroll horizontally inside the vertical collector scroll. */
export function ChoiceChips({
  options,
  selectedId,
  onSelect,
}: {
  readonly options: readonly ConversationOption[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}) {
  const { theme } = useTheme();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const canScrollRight =
    contentWidth > viewportWidth + 1 && offsetX < contentWidth - viewportWidth - 1;

  return (
    <Box
      style={styles.chipScroller}
      onLayout={event => setViewportWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        testID="onboarding-choice-chips"
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        onContentSizeChange={width => setContentWidth(width)}
        onScroll={event => setOffsetX(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
      >
        {options.map(option => (
          <FilterChipButton
            key={option.id}
            style={styles.chipTarget}
            label={option.label}
            icon={option.icon}
            isActive={selectedId === option.id}
            onPress={() => onSelect(option.id)}
          />
        ))}
      </ScrollView>
      {canScrollRight ? (
        <Box pointerEvents="none" background="background" style={styles.chipCue}>
          <AppIcon name={Icon.ChevronRight} size={Size.iconXs} color={theme.textSecondary} />
        </Box>
      ) : null}
    </Box>
  );
}

export function CollectedList({
  items,
  currency,
}: {
  readonly items: readonly CollectedItem[];
  readonly currency: string;
}) {
  if (items.length === 0) return null;
  return (
    <Stack gap="sm">
      {items.map(item => (
        <View key={item.id}>
          <CollectedRow item={item} currency={currency} />
        </View>
      ))}
      <Stack direction="row" align="center" justify="center" gap="xs">
        <AppIcon name={Icon.ChevronLeft} size={Size.iconXs} color="textSecondary" />
        <AppText variant="caption" color="secondary">
          {copy.swipeToRemove}
        </AppText>
      </Stack>
    </Stack>
  );
}

export function CollectStep({
  title,
  subtitle,
  continueLabel,
  onContinue,
  continueDisabled,
  skipLabel,
  onSkip,
  onBack,
  chips,
  onAddChip,
  currency,
  items,
  validationMessage,
  recovery,
  footer,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly continueLabel?: string;
  readonly onContinue: () => void;
  readonly continueDisabled?: boolean;
  readonly skipLabel?: string;
  readonly onSkip?: () => void;
  readonly onBack: () => void;
  readonly chips: readonly ConversationOption[];
  readonly onAddChip: (id: string) => void;
  readonly currency: string;
  readonly items: readonly CollectedItem[];
  readonly validationMessage?: string | null;
  readonly recovery?: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <ConversationStep
      title={title}
      subtitle={subtitle}
      primaryLabel={continueLabel}
      primaryDisabled={continueDisabled}
      onPrimary={onContinue}
      skipLabel={skipLabel}
      onSkip={onSkip}
      onBack={onBack}
      validationMessage={validationMessage}
      recovery={recovery}
      footer={footer}
    >
      <Stack gap="md">
        <ChoiceChips options={chips} onSelect={onAddChip} />
        <CollectedList items={items} currency={currency} />
      </Stack>
    </ConversationStep>
  );
}

const styles = StyleSheet.create({
  fillPanel: {
    flexGrow: 1,
    minHeight: 0,
  },
  chipTarget: {
    minHeight: Platform.OS === 'android' ? 48 : 44,
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  chipScroller: {
    position: 'relative',
  },
  chipCue: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingRight: Spacing.xl,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  title: {
    width: '100%',
    fontSize: Typography.roles.xl.fontSize,
    lineHeight: Typography.roles.xl.lineHeight,
  },
  subtitle: {
    textAlign: 'center',
    width: '100%',
  },
});
