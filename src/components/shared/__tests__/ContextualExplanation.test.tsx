import { ContextualExplanation } from '../ContextualExplanation';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import type { ReactNode } from 'react';

jest.mock('@/src/components/overlays/InfoSheet', () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    InfoSheet: ({
      visible,
      title,
      onClose,
      accessibilityCloseLabel,
      children,
    }: {
      visible: boolean;
      title: string;
      onClose: () => void;
      accessibilityCloseLabel: string;
      children: ReactNode;
    }) =>
      visible ? (
        <View testID="explanation-sheet">
          <Text>{title}</Text>
          {children}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityCloseLabel}
            onPress={onClose}
          >
            <Text>Close</Text>
          </Pressable>
        </View>
      ) : null,
  };
});

describe('ContextualExplanation', () => {
  it('opens an accessible, scoped explanation and closes it consistently', () => {
    render(
      <ContextualExplanation
        title="Net flow"
        meaning="Net income minus net spending."
        interpretation="Above zero means income exceeded spending."
        unit="INR"
        context={[
          { label: 'Period', value: 'March 1–31' },
          { label: 'Accounts', value: 'All accounts' },
        ]}
        testID="explain-net-flow"
      />,
    );

    expect(screen.getByRole('button', { name: 'Explain Net flow' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Explain Net flow' }));

    expect(screen.getByText('Net income minus net spending.')).toBeTruthy();
    expect(screen.getByText('March 1–31')).toBeTruthy();
    expect(screen.getByText('INR')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Close Net flow explanation' }));
    expect(screen.queryByText('Net income minus net spending.')).toBeNull();
  });
});
