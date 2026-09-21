import { AppConfig } from '@/src/constants';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import type { TabType } from '@/src/types/domainJournal';
import { TransactionTypeSegmentedControl } from '../components/TransactionTypeSegmentedControl';

type MockSegmentedControlProps = {
  options: readonly { id: TabType; label: string; color?: string }[];
  onChange: (id: TabType) => void;
};

jest.mock('@/src/components/core', () => {
  const { Pressable, Text, View } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native');
  const { Icon } = jest.requireActual(
    '@/src/types/domainIcons',
  ) as typeof import('@/src/types/domainIcons');

  return {
    AppSegmentedControl: ({ options, onChange }: MockSegmentedControlProps) => (
      <View>
        {options.map(option => (
          <Pressable
            key={option.id}
            testID={`transaction-type-${option.id}`}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            onPress={() => onChange(option.id)}
          >
            <Text testID={`transaction-type-${option.id}-label`} style={{ color: option.color }}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    ),
    Icon,
  };
});

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      surfaceSecondary: '#111111',
      surface: '#222222',
      textSecondary: '#333333',
      expense: '#dd0000',
      income: '#00aa00',
      primary: '#0000dd',
    },
  }),
}));

describe('TransactionTypeSegmentedControl', () => {
  it('uses typed selection callbacks and exposes labels for the standard control', () => {
    const onChange = jest.fn<void, [TabType]>();

    render(
      <TransactionTypeSegmentedControl
        variant="standard"
        value="expense"
        onChange={onChange}
        accentColor="#ff0000"
      />,
    );

    expect(screen.getByRole('tab', { name: AppConfig.strings.journal.expense })).toBeTruthy();
    expect(screen.getByRole('tab', { name: AppConfig.strings.journal.income })).toBeTruthy();
    expect(screen.getByRole('tab', { name: AppConfig.strings.journal.transfer })).toBeTruthy();

    fireEvent.press(screen.getByRole('tab', { name: AppConfig.strings.journal.income }));

    expect(onChange).toHaveBeenCalledWith('income');
  });

  it('provides per-type colors in compact icon-only mode', () => {
    render(
      <TransactionTypeSegmentedControl
        variant="compact"
        value="expense"
        onChange={jest.fn()}
        accentColor="#ff0000"
      />,
    );

    expect(screen.getByTestId('transaction-type-expense-label')).toHaveStyle({ color: '#dd0000' });
    expect(screen.getByTestId('transaction-type-income-label')).toHaveStyle({ color: '#00aa00' });
    expect(screen.getByTestId('transaction-type-transfer-label')).toHaveStyle({ color: '#0000dd' });
  });
});
