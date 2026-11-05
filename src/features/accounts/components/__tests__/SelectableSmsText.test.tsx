import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SelectableSmsText } from '../SelectableSmsText';
import type { SmsTextSpan } from '@/src/services/journal/smsTextSpans';

jest.mock('@/src/components/core', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text: NativeText, Pressable } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native');
  return {
    AppText: (props: object) => React.createElement(NativeText, props),
    PressScaleTouchable: (props: object) => React.createElement(Pressable, props),
  };
});

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: { surfaceSecondary: '#222222', error: '#EB5757' },
    getVariantColors: () => ({ main: '#00aa88' }),
  }),
}));

function ControlledSelectableText({ initialSpans = [] }: { initialSpans?: SmsTextSpan[] }) {
  const [spans, setSpans] = useState<SmsTextSpan[]>(initialSpans);
  return (
    <View>
      <SelectableSmsText
        body="Your card ending with 1234"
        selectedSpans={spans}
        onChange={setSpans}
      />
      <Text testID="selected-spans">{JSON.stringify(spans)}</Text>
    </View>
  );
}

function ControlledPhonePhrase() {
  const body = 'Call 18004251199 -Federal Bank';
  const [spans, setSpans] = useState<SmsTextSpan[]>([{ start: 0, end: body.length }]);
  return <SelectableSmsText body={body} selectedSpans={spans} onChange={setSpans} />;
}

describe('SelectableSmsText', () => {
  it('exposes word buttons, merges adjacent selections, and marks selected words', () => {
    const screen = render(<ControlledSelectableText />);
    expect(screen.getByTestId('sms-word-1').props.accessibilityRole).toBe('button');
    fireEvent.press(screen.getByTestId('sms-word-1'));
    fireEvent.press(screen.getByTestId('sms-word-2'));

    expect(screen.getByTestId('sms-word-1').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('sms-word-2').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('selected-spans').props.children).toBe('[{"start":5,"end":16}]');
  });

  it('shows fixed words with collapsed XXX runs, then reveals actual words without changing conditions', () => {
    const screen = render(<ControlledSelectableText initialSpans={[{ start: 5, end: 16 }]} />);

    expect(screen.getAllByLabelText('Reveal hidden words')).toHaveLength(2);
    expect(screen.queryByTestId('sms-word-0')).toBeNull();
    expect(screen.getByTestId('sms-word-1').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('selected-spans').props.children).toBe('[{"start":5,"end":16}]');

    fireEvent.press(screen.getAllByLabelText('Reveal hidden words')[0]);
    expect(screen.getByTestId('sms-word-0')).toBeTruthy();
    expect(screen.getByTestId('sms-word-4')).toBeTruthy();
    expect(screen.getByTestId('selected-spans').props.children).toBe('[{"start":5,"end":16}]');

    fireEvent.press(screen.getByTestId('sms-word-3'));
    expect(screen.getByTestId('selected-spans').props.children).toBe('[{"start":5,"end":21}]');
    fireEvent.press(screen.getByTestId('toggle-sms-pattern'));
    expect(screen.queryByTestId('sms-word-4')).toBeNull();
    expect(screen.getByTestId('sms-word-3').props.accessibilityState.selected).toBe(true);
  });

  it('toggles individual required words using original source offsets in the masked pattern', () => {
    const screen = render(<ControlledSelectableText initialSpans={[{ start: 5, end: 16 }]} />);
    fireEvent.press(screen.getByTestId('sms-word-1'));
    expect(screen.getByTestId('selected-spans').props.children).toBe('[{"start":10,"end":16}]');
    expect(screen.queryByTestId('sms-word-1')).toBeNull();
    expect(screen.getByTestId('sms-word-2').props.accessibilityState.selected).toBe(true);
  });

  it('highlights one continuous phrase including the phone, then splits it when that word is removed', () => {
    const screen = render(<ControlledPhonePhrase />);
    expect(screen.getAllByTestId(/^sms-phrase-/)).toHaveLength(1);
    expect(screen.getByTestId('sms-phrase-0').props.style.backgroundColor).toBeTruthy();
    expect(screen.getByTestId('sms-word-1').props.style.backgroundColor).toBeUndefined();
    expect(screen.getByText('1 / 6 phrases')).toBeTruthy();

    fireEvent.press(screen.getByTestId('sms-word-1'));
    expect(screen.getAllByTestId(/^sms-phrase-/)).toHaveLength(2);
    expect(screen.getByText('2 / 6 phrases')).toBeTruthy();
    fireEvent.press(screen.getByTestId('toggle-sms-pattern'));
    expect(screen.getByTestId('sms-word-1').props.accessibilityState.selected).toBe(false);
    fireEvent.press(screen.getByTestId('sms-word-1'));
    expect(screen.getAllByTestId(/^sms-phrase-/)).toHaveLength(1);
    expect(screen.getByText('1 / 6 phrases')).toBeTruthy();
  });

  it('gives six phrases distinct fills and marks a seventh as over the limit', () => {
    const body = 'one x two x three x four x five x six x seven';
    const spans = [...body.matchAll(/one|two|three|four|five|six|seven/g)].map(match => ({
      start: match.index,
      end: match.index + match[0].length,
    }));
    const screen = render(
      <SelectableSmsText body={body} selectedSpans={spans} onChange={jest.fn()} />,
    );
    const fills = spans.map(
      span => screen.getByTestId(`sms-phrase-${span.start}`).props.style.backgroundColor,
    );
    expect(new Set(fills.slice(0, 6)).size).toBe(6);
    expect(fills.slice(0, 6)).not.toContain(fills[6]);
    expect(screen.getByText('7 / 6 phrases')).toBeTruthy();
    expect(screen.getByTestId('sms-phrase-limit-error').props.accessibilityRole).toBe('alert');
  });

  it('keeps the entire sample hidden in privacy mode', () => {
    const screen = render(
      <SelectableSmsText
        body="Your card ending with 1234"
        selectedSpans={[{ start: 5, end: 16 }]}
        onChange={jest.fn()}
        privateMode
      />,
    );
    expect(screen.getByTestId('selectable-sms-private')).toBeTruthy();
    expect(screen.queryByTestId('sms-word-1')).toBeNull();
    expect(screen.queryByTestId('toggle-sms-pattern')).toBeNull();
  });
});
