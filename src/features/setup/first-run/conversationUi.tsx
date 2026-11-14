import { KeyboardAwareScrollView } from '@/src/design-system/KeyboardAwareScrollView';
import { AppButton, AppIcon, AppText, FilterChipButton } from '@/src/components/core';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Size, Spacing, Typography } from '@/src/constants';
import { Box, Stack, usePageKeyboard } from '@/src/design-system';
import { OnboardingFadePanel } from './OnboardingFadePanel';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { type ReactNode, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';
import Animated, { Easing, LinearTransition } from 'react-native-reanimated';
import { CollectedRow, type CollectedItem } from './CollectedRow';

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
  validation,
  validationSlot,
  footerValidation,
  fieldValidation,
  error,
  errors,
  errorMessage,
  recovery,
  recoveryActions,
  recoverySlot,
  footer,
  footerSlot,
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
  readonly validation?: ReactNode;
  readonly validationSlot?: ReactNode;
  readonly footerValidation?: ReactNode;
  readonly fieldValidation?: ReactNode;
  readonly error?: ReactNode;
  readonly errors?: ReactNode;
  readonly errorMessage?: ReactNode;
  readonly recovery?: ReactNode;
  readonly recoveryActions?: ReactNode;
  readonly recoverySlot?: ReactNode;
  readonly footer?: ReactNode;
  readonly footerSlot?: ReactNode;
}) {
  const [footerHeight, setFooterHeight] = useState(0);
  const { isKeyboardVisible } = usePageKeyboard();
  const footerValidationNodes = [
    validation,
    validationSlot,
    footerValidation,
    fieldValidation,
    error,
    errors,
    errorMessage,
    recovery,
    recoveryActions,
    recoverySlot,
    footer,
    footerSlot,
  ].filter(Boolean);

  return (
    <Box flex={1} minHeight={0}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: footerHeight + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <OnboardingFadePanel>
          <Stack gap="lg" paddingTop={title ? 'xl' : 'sm'}>
            {title ? (
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
            ) : null}
            {children}
          </Stack>
        </OnboardingFadePanel>
      </KeyboardAwareScrollView>
      <Box
        background="background"
        borderTopWidth={1}
        borderColor="border"
        paddingTop="md"
        onLayout={event => {
          const height = event.nativeEvent.layout.height;
          setFooterHeight(previousHeight =>
            previousHeight === height ? previousHeight : height,
          );
        }}
      >
        <Stack space="xs">
          {footerValidationNodes.length > 0 ? (
            <Stack space="xs">{footerValidationNodes}</Stack>
          ) : null}
          {onSkip ? (
            <AppButton variant="ghost" size="md" onPress={onSkip} testID="onboarding-skip">
              {skipLabel ?? copy.addLater}
            </AppButton>
          ) : null}
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
          <AppButton variant="ghost" size="md" onPress={onBack}>
            {copy.back}
          </AppButton>
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
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;
  const rowLayout = reduceMotion
    ? undefined
    : LinearTransition.duration(320).easing(Easing.out(Easing.cubic));
  return (
    <Stack gap="sm">
      {items.map(item => (
        <Animated.View key={item.id} layout={rowLayout}>
          <CollectedRow item={item} currency={currency} />
        </Animated.View>
      ))}
      <AppText variant="caption" color="secondary" style={styles.swipeHint}>
        {copy.swipeToRemove}
      </AppText>
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
  chipLabel,
  chips,
  onAddChip,
  currency,
  items,
  validation,
  validationSlot,
  footerValidation,
  fieldValidation,
  error,
  errors,
  errorMessage,
  recovery,
  recoveryActions,
  recoverySlot,
  footer,
  footerSlot,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly continueLabel?: string;
  readonly onContinue: () => void;
  readonly continueDisabled?: boolean;
  readonly skipLabel?: string;
  readonly onSkip?: () => void;
  readonly onBack: () => void;
  readonly chipLabel: string;
  readonly chips: readonly ConversationOption[];
  readonly onAddChip: (id: string) => void;
  readonly currency: string;
  readonly items: readonly CollectedItem[];
  readonly validation?: ReactNode;
  readonly validationSlot?: ReactNode;
  readonly footerValidation?: ReactNode;
  readonly fieldValidation?: ReactNode;
  readonly error?: ReactNode;
  readonly errors?: ReactNode;
  readonly errorMessage?: ReactNode;
  readonly recovery?: ReactNode;
  readonly recoveryActions?: ReactNode;
  readonly recoverySlot?: ReactNode;
  readonly footer?: ReactNode;
  readonly footerSlot?: ReactNode;
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
      validation={validation}
      validationSlot={validationSlot}
      footerValidation={footerValidation}
      fieldValidation={fieldValidation}
      error={error}
      errors={errors}
      errorMessage={errorMessage}
      recovery={recovery}
      recoveryActions={recoveryActions}
      recoverySlot={recoverySlot}
      footer={footer}
      footerSlot={footerSlot}
    >
      <Stack gap="md">
        <AppText variant="caption" color="secondary">
          {chipLabel}
        </AppText>
        <ChoiceChips options={chips} onSelect={onAddChip} />
        <CollectedList items={items} currency={currency} />
      </Stack>
    </ConversationStep>
  );
}

const styles = StyleSheet.create({
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
    lineHeight: Typography.sizes.xxxl * Typography.lineHeights.tight,
  },
  subtitle: {
    textAlign: 'center',
    width: '100%',
  },
  swipeHint: {
    textAlign: 'center',
  },
});
