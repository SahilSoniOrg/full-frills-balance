import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { AccountType } from '@/src/types/enums';
import { WorkplaceAccountSelectionStep } from '../WorkplaceAccountSelectionStep';
import { WorkplaceCategorySelectionStep } from '../WorkplaceCategorySelectionStep';

type MockGridProps = {
  title: string;
  validationMessage?: string;
  onContinue: () => void;
  listFooterContent: { props: { typeOptions: unknown } };
  sections: { title: string }[];
};

let mockGridProps: MockGridProps;

jest.mock('@/src/components/common/SelectableGrid', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text, View } = require('react-native');
  return {
    SelectableGrid: (props: MockGridProps) => {
      mockGridProps = props;
      return React.createElement(
        View,
        null,
        React.createElement(Text, null, props.title),
        props.validationMessage && React.createElement(Text, null, props.validationMessage),
        React.createElement(
          Pressable,
          { testID: 'mock-selectable-continue', onPress: props.onContinue },
          React.createElement(Text, null, 'Continue'),
        ),
      );
    },
  };
});

jest.mock('@/src/components/common/CategoryCreationBar', () => ({
  CategoryCreationBar: () => null,
}));

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      asset: '#1473a3',
      liability: '#a54d26',
      success: '#14734f',
      error: '#a52b2b',
      textSecondary: '#555',
    },
  }),
}));

describe('Workplace setup selection steps', () => {
  it('offers explicit Asset/Liability custom accounts and enforces one account', () => {
    const onContinue = jest.fn();
    render(
      <WorkplaceAccountSelectionStep
        selectedAccounts={[]}
        customAccounts={[]}
        onToggleAccount={jest.fn()}
        onAddCustomAccount={jest.fn()}
        onContinue={onContinue}
        onBack={jest.fn()}
        isCompleting={false}
      />,
    );

    expect(mockGridProps.listFooterContent.props.typeOptions).toEqual([
      expect.objectContaining({ type: AccountType.ASSET, label: 'Asset' }),
      expect.objectContaining({ type: AccountType.LIABILITY, label: 'Liability' }),
    ]);

    fireEvent.press(screen.getByTestId('mock-selectable-continue'));
    expect(screen.getByText('Select at least one account to continue.')).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('groups categories and requires both income and expense selections', () => {
    const onContinue = jest.fn();
    render(
      <WorkplaceCategorySelectionStep
        selectedCategories={['Salary']}
        customCategories={[]}
        onToggleCategory={jest.fn()}
        onAddCustomCategory={jest.fn()}
        onContinue={onContinue}
        onBack={jest.fn()}
        isCompleting={false}
      />,
    );

    expect(mockGridProps.sections.map((section: { title: string }) => section.title)).toEqual([
      'Income',
      'Expense',
    ]);
    fireEvent.press(screen.getByTestId('mock-selectable-continue'));
    expect(screen.getByText('Choose at least one income and one expense category.')).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
