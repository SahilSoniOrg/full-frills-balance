import { WorkplaceCurrencyStep } from '@/src/features/setup';

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
