import { computeFitFontSize, FitText } from '@/src/components/shared/FitText';
import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import { StyleSheet, Text } from 'react-native';

const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 80 } } });
const measuringText = () =>
  screen.UNSAFE_getAllByType(Text).find(text => typeof text.props.onLayout === 'function')!;
const container = () =>
  screen.UNSAFE_root.findAll(
    n => StyleSheet.flatten(n.props.style)?.overflow === 'hidden' && !!n.props.onLayout,
  )[0];
const amountStyle = () => StyleSheet.flatten(screen.getByTestId('amount').props.style);

describe('computeFitFontSize', () => {
  const base = { maxFontSize: 72, minFontSize: 36 };

  it('keeps the max size until both widths are measured', () => {
    expect(computeFitFontSize({ ...base, naturalWidth: 0, availableWidth: 358 })).toBe(72);
    expect(computeFitFontSize({ ...base, naturalWidth: 431, availableWidth: 0 })).toBe(72);
  });

  it('keeps the max size when the text already fits', () => {
    expect(computeFitFontSize({ ...base, naturalWidth: 300, availableWidth: 358 })).toBe(72);
  });

  it('shrinks proportionally so a long amount fits on one line', () => {
    const size = computeFitFontSize({ ...base, naturalWidth: 431, availableWidth: 358 });
    expect(size).toBe(58);
    expect((431 * size) / 72).toBeLessThanOrEqual(358);
  });

  it('never goes below the minimum', () => {
    expect(computeFitFontSize({ ...base, naturalWidth: 2000, availableWidth: 288 })).toBe(36);
  });
});

describe('FitText', () => {
  it('does not oscillate when fitted text widths round to whole pixels', () => {
    render(
      <FitText testID="amount" maxFontSize={16} minFontSize={8} lineHeightRatio={1.2}>
        ₹12,345.67
      </FitText>,
    );
    fireEvent(measuringText(), 'layout', layout(104));
    fireEvent(container(), 'layout', layout(87));
    expect(amountStyle().fontSize).toBe(13);

    for (let frame = 0; frame < 6; frame++) {
      const width = Math.round((104 * amountStyle().fontSize) / 16);
      // Native layout events target the text itself, without bubbling to the wrapper.
      act(() => screen.getByTestId('amount').props.onLayout?.(layout(width)));
      expect(amountStyle().fontSize).toBe(13);
    }
  });

  it('does not reinterpret a repeated layout event using the new fitted size', () => {
    render(
      <FitText testID="amount" maxFontSize={72} minFontSize={36} lineHeightRatio={1.2}>
        ₹9,87,65,433
      </FitText>,
    );
    fireEvent(measuringText(), 'layout', layout(431));
    fireEvent(container(), 'layout', layout(358));
    expect(amountStyle().fontSize).toBe(58);

    fireEvent(measuringText(), 'layout', layout(431));
    expect(amountStyle().fontSize).toBe(58);
  });

  it('shrinks to the fitted size once container and text widths are known', () => {
    render(
      <FitText testID="amount" maxFontSize={72} minFontSize={36} lineHeightRatio={1.2}>
        ₹9,87,65,433
      </FitText>,
    );
    expect(amountStyle().fontSize).toBe(72);
    expect(screen.getByTestId('amount').props.numberOfLines).toBe(1);

    fireEvent(measuringText(), 'layout', layout(431));
    fireEvent(container(), 'layout', layout(358));
    expect(amountStyle().fontSize).toBe(58);
    expect(amountStyle().lineHeight).toBe(70);

    // The measuring copy keeps its original size after the visible text shrinks.
    expect(StyleSheet.flatten(measuringText().props.style).fontSize).toBe(72);
    fireEvent(measuringText(), 'layout', layout(431));
    expect(amountStyle().fontSize).toBe(58);
  });

  it('refits when the container changes and grows back when room is available', () => {
    render(
      <FitText testID="amount" maxFontSize={72} minFontSize={36} lineHeightRatio={1.2}>
        ₹9,87,65,433
      </FitText>,
    );
    fireEvent(measuringText(), 'layout', layout(431));
    fireEvent(container(), 'layout', layout(358));
    expect(amountStyle().fontSize).toBe(58);
    fireEvent(container(), 'layout', layout(288));
    expect(amountStyle().fontSize).toBe(47);
    fireEvent(container(), 'layout', layout(500));
    expect(amountStyle().fontSize).toBe(72);
  });

  it('remeasures changed content and font bounds without resetting on unrelated rerenders', () => {
    const text = (children: string, maxFontSize = 72, color: 'text' | 'error' = 'text') => (
      <FitText
        testID="amount"
        maxFontSize={maxFontSize}
        minFontSize={36}
        lineHeightRatio={1.2}
        color={color}
      >
        {children}
      </FitText>
    );
    const { rerender } = render(text('₹9,87,65,433'));
    fireEvent(measuringText(), 'layout', layout(431));
    fireEvent(container(), 'layout', layout(358));
    expect(amountStyle().fontSize).toBe(58);

    rerender(text('₹9,87,65,433', 72, 'error'));
    expect(amountStyle().fontSize).toBe(58);
    rerender(text('••••'));
    fireEvent(measuringText(), 'layout', layout(100));
    expect(amountStyle().fontSize).toBe(72);

    rerender(text('₹9,87,65,433', 48));
    expect(StyleSheet.flatten(measuringText().props.style).fontSize).toBe(48);
    fireEvent(measuringText(), 'layout', layout(400));
    expect(amountStyle().fontSize).toBe(42);
  });

  it.each(['left', 'center', 'right'] as const)(
    'keeps %s-aligned hug width based on the fixed-size measurement',
    align => {
      render(
        <FitText
          testID="amount"
          maxFontSize={72}
          minFontSize={36}
          lineHeightRatio={1.2}
          align={align}
          hug
        >
          ₹9,87,65,433
        </FitText>,
      );
      fireEvent(measuringText(), 'layout', layout(431.25));
      fireEvent(container(), 'layout', layout(358));
      expect(amountStyle().fontSize).toBe(58);
      expect(StyleSheet.flatten(container().props.style).width).toBe(442);
      fireEvent(container(), 'layout', layout(288));
      expect(amountStyle().fontSize).toBe(47);
      expect(StyleSheet.flatten(container().props.style).width).toBe(442);
      expect(screen.getByTestId('amount').props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ textAlign: align })]),
      );
    },
  );

  it('exposes only the visible amount to accessibility and preserves measurement typography', () => {
    render(
      <FitText
        testID="amount"
        accessibilityLabel="Account balance"
        maxFontSize={72}
        minFontSize={36}
        lineHeightRatio={1.2}
        variant="hero"
        fontRole="numeric"
        weight="semibold"
        tabular
        allowFontScaling={false}
        maxFontSizeMultiplier={1.2}
        style={{ letterSpacing: 1.5 }}
      >
        ₹9,87,65,433
      </FitText>,
    );
    expect(screen.getAllByText('₹9,87,65,433')).toHaveLength(1);
    expect(screen.getAllByLabelText('Account balance')).toHaveLength(1);
    const visible = amountStyle();
    const measured = StyleSheet.flatten(measuringText().props.style);
    expect(measured.fontFamily).toBe(visible.fontFamily);
    expect(measured.fontVariant).toEqual(visible.fontVariant);
    expect(measured.letterSpacing).toBe(1.5);
    expect(measuringText().props.allowFontScaling).toBe(false);
    expect(measuringText().props.maxFontSizeMultiplier).toBe(1.2);
  });
});
