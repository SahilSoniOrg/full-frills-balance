import { WorkplaceCurrencyStep } from '@/src/features/setup';
import { triggerHaptic } from '@/src/utils/haptics';

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
      onContinue={() => {
        void triggerHaptic('light');
        onContinue();
      }}
      onBack={onBack}
      isCompleting={false}
    />
  );
}
