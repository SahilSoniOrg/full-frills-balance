import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { SetupReviewStep } from '../SetupReviewStep';

jest.mock('@/src/hooks/useThemePrefs', () => ({
  useThemePrefs: () => ({
    themeId: 'ivy',
    fontId: 'editorial',
    themeMode: 'light',
  }),
}));

describe('SetupReviewStep', () => {
  it('shows the setup summary and routes each Change action to its draft step', () => {
    const changes = {
      identity: jest.fn(),
      currency: jest.fn(),
      accounts: jest.fn(),
      categories: jest.fn(),
      appearance: jest.fn(),
      confirm: jest.fn(),
      back: jest.fn(),
    };

    render(
      <SetupReviewStep
        name="Sahil"
        workplaceName="Sahil's Personal workplace"
        workplaceIcon="briefcase"
        selectedCurrency="USD"
        accountCount={3}
        categoryCount={6}
        themeId="ivy"
        fontId="editorial"
        onChangeProfile={changes.identity}
        onChangeWorkplace={changes.identity}
        onChangeCurrency={changes.currency}
        onChangeAccounts={changes.accounts}
        onChangeCategories={changes.categories}
        onChangeAppearance={changes.appearance}
        onConfirm={changes.confirm}
        onBack={changes.back}
        isCompleting={false}
      />,
    );

    expect(screen.getByText('Ready when you are')).toBeTruthy();
    expect(screen.getByText("Sahil's Personal workplace")).toBeTruthy();
    expect(screen.getByText('USD')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('Ivy · Classic Serif')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Change Profile'));
    fireEvent.press(screen.getByLabelText('Change Currency'));
    fireEvent.press(screen.getByLabelText('Change Accounts'));
    fireEvent.press(screen.getByLabelText('Change Categories'));
    fireEvent.press(screen.getByLabelText('Change Appearance'));
    fireEvent.press(screen.getByTestId('onboarding-finish-button'));

    expect(changes.identity).toHaveBeenCalledTimes(1);
    expect(changes.currency).toHaveBeenCalledTimes(1);
    expect(changes.accounts).toHaveBeenCalledTimes(1);
    expect(changes.categories).toHaveBeenCalledTimes(1);
    expect(changes.appearance).toHaveBeenCalledTimes(1);
    expect(changes.confirm).toHaveBeenCalledTimes(1);
  });

  it('hides workplace data changes for an imported Workplace', () => {
    render(
      <SetupReviewStep
        name="Sahil"
        workplaceName="Imported workplace"
        workplaceIcon="briefcase"
        selectedCurrency="USD"
        accountCount={46}
        categoryCount={65}
        themeId="ivy"
        fontId="editorial"
        onChangeProfile={jest.fn()}
        onChangeWorkplace={jest.fn()}
        onChangeCurrency={jest.fn()}
        onChangeAccounts={jest.fn()}
        onChangeCategories={jest.fn()}
        onChangeAppearance={jest.fn()}
        onConfirm={jest.fn()}
        onBack={jest.fn()}
        isCompleting={false}
        isImportedWorkplace
      />,
    );

    expect(screen.getByLabelText('Change Profile')).toBeTruthy();
    expect(screen.queryByLabelText('Change Workplace')).toBeNull();
    expect(screen.queryByLabelText('Change Currency')).toBeNull();
    expect(screen.queryByLabelText('Change Accounts')).toBeNull();
    expect(screen.queryByLabelText('Change Categories')).toBeNull();
    expect(screen.getByLabelText('Change Appearance')).toBeTruthy();
  });

  it('hides the profile row when the recipe has no Device slice', () => {
    render(
      <SetupReviewStep
        name=""
        workplaceName="New workplace"
        workplaceIcon="briefcase"
        selectedCurrency="USD"
        accountCount={2}
        categoryCount={4}
        themeId="ivy"
        fontId="editorial"
        onChangeProfile={jest.fn()}
        onChangeWorkplace={jest.fn()}
        onChangeCurrency={jest.fn()}
        onChangeAccounts={jest.fn()}
        onChangeCategories={jest.fn()}
        onChangeAppearance={jest.fn()}
        onConfirm={jest.fn()}
        onBack={jest.fn()}
        isCompleting={false}
        showAppearance={false}
        showProfile={false}
      />,
    );

    expect(screen.queryByLabelText('Change Profile')).toBeNull();
    expect(screen.queryByLabelText('Change Appearance')).toBeNull();
  });
});
