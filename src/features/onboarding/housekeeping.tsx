import { WorkplaceCurrencyStep } from '@/src/features/setup';
import { AppInput } from '@/src/components/core';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { ConversationStep } from './conversationUi';

export function YouScene({
  name,
  onNameChange,
  onContinue,
  onBack,
}: {
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly onContinue: (heard: string) => void;
  readonly onBack: () => void;
}) {
  const trimmed = (name ?? '').trim();
  return (
    <ConversationStep
      title={copy.youTitle}
      subtitle={copy.youHint}
      primaryDisabled={!trimmed}
      onPrimary={() => onContinue(copy.confirmYou(trimmed))}
      onBack={onBack}
    >
      <AppInput
        label={copy.youLabel}
        placeholder={copy.youPlaceholder}
        value={name ?? ''}
        onChangeText={onNameChange}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => {
          if (trimmed) onContinue(copy.confirmYou(trimmed));
        }}
        accessibilityLabel={copy.youLabel}
        testID="onboarding-name-input"
      />
    </ConversationStep>
  );
}

export function CurrencyScene({
  currency,
  onSelectCurrency,
  onContinue,
  onBack,
}: {
  readonly currency: string;
  readonly onSelectCurrency: (code: string) => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
}) {
  return (
    <WorkplaceCurrencyStep
      selectedCurrency={currency}
      onSelectCurrency={onSelectCurrency}
      onContinue={onContinue}
      onBack={onBack}
      isCompleting={false}
    />
  );
}
