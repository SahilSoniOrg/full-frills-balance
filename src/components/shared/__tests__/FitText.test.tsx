import { computeFitFontSize, FitText } from '@/src/components/shared/FitText';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { StyleSheet } from 'react-native';

const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 80 } } });

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
  it('shrinks to the fitted size once container and text widths are known', () => {
    render(
      <FitText testID="amount" maxFontSize={72} minFontSize={36} lineHeightRatio={1.2}>
        ₹9,87,65,433
      </FitText>,
    );
    const flat = () => StyleSheet.flatten(screen.getByTestId('amount').props.style);
    expect(flat().fontSize).toBe(72);
    expect(screen.getByTestId('amount').props.numberOfLines).toBe(1);

    fireEvent(screen.getByTestId('amount'), 'layout', layout(431));
    const container = screen.UNSAFE_root.findAll(
      n => StyleSheet.flatten(n.props.style)?.overflow === 'hidden' && !!n.props.onLayout,
    )[0];
    fireEvent(container, 'layout', layout(358));
    expect(flat().fontSize).toBe(58);
    expect(flat().lineHeight).toBe(70);

    // Re-measuring at the new size is stable (no feedback loop).
    fireEvent(screen.getByTestId('amount'), 'layout', layout((431 * 58) / 72));
    expect(flat().fontSize).toBe(58);
  });
});
