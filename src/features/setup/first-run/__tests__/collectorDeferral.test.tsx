import { PlannedPaymentInterval } from '@/src/types/enums';
import { fireEvent, render, screen } from '@/src/testing/render';
import { IncomeScene } from '../collectors';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';

jest.mock('@/src/components/filters/DateTimePickerModal', () => ({
  DateTimePickerModal: () => null,
}));

jest.mock('@/src/components/filters/SelectionPickerSheet', () => ({
  SelectionPickerSheet: () => null,
}));

const income = {
  kind: 'recurring' as const,
  items: [
    {
      id: 'salary',
      name: 'Salary',
      source: 'salary' as const,
      amount: 25000,
      interval: PlannedPaymentInterval.MONTHLY,
      intervalN: 1,
      nextDate: Date.now(),
    },
  ],
};

function renderIncome(deferred: boolean) {
  const onContinue = jest.fn();
  const onNeedAccount = jest.fn();
  render(
    <IncomeScene
      currency="USD"
      income={income}
      onIncomeChange={jest.fn()}
      onContinue={onContinue}
      onBack={jest.fn()}
      hasSpendable={false}
      onNeedAccount={onNeedAccount}
      editableInput={{
        amountTextById: { salary: '250' },
        deferredCollections: deferred ? { income: true } : undefined,
      }}
      locale="en-US"
    />,
  );
  return { onContinue, onNeedAccount };
}

describe('deferred collector continue', () => {
  it('leaves a deferred collection without asking for a spendable account', () => {
    const { onContinue, onNeedAccount } = renderIncome(true);
    fireEvent.press(screen.getByText(copy.continueToPayments));
    expect(onNeedAccount).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledWith(copy.confirmIncomeSkipped);
  });

  it('keeps an included collection on the step until a spendable account exists', () => {
    const { onContinue, onNeedAccount } = renderIncome(false);
    fireEvent.press(screen.getByText(copy.continueToPayments));
    expect(onNeedAccount).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
