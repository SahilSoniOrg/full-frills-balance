import { extractBoxProps, resolvePaddingSpacing, splitBoxStyles } from '../utils';

describe('Design System Utilities', () => {
  describe('extractBoxProps', () => {
    it('separates whitelisted box props from component-specific props', () => {
      const props = {
        padding: 'md',
        margin: 10,
        color: 'red', // Not a box prop
        label: 'Submit', // Not a box prop
      };

      const { boxProps, restProps } = extractBoxProps(props);

      expect(boxProps).toEqual({ padding: 'md', margin: 10 });
      expect(restProps).toEqual({ color: 'red', label: 'Submit' });
    });

    it('correctly handles polymorphism and style whitelisting', () => {
      const props = {
        as: 'div',
        style: { opacity: 0.5 },
        testID: 'box',
      };

      const { boxProps, restProps } = extractBoxProps(props);

      expect(boxProps).toEqual({ as: 'div', style: { opacity: 0.5 } });
      expect(restProps).toEqual({ testID: 'box' });
    });

    it('keeps native interaction and accessibility props out of box props', () => {
      const props = {
        padding: 'md',
        pointerEvents: 'none',
        accessible: true,
        accessibilityRole: 'button',
        accessibilityLabel: 'Open details',
        testID: 'row',
        hitSlop: { top: 8, right: 8, bottom: 8, left: 8 },
        nativeID: 'settings-row',
        onPress: jest.fn(),
      };

      const { boxProps, restProps } = extractBoxProps(props);

      expect(boxProps).toEqual({ padding: 'md' });
      expect(restProps).toMatchObject({
        pointerEvents: 'none',
        accessible: true,
        accessibilityRole: 'button',
        accessibilityLabel: 'Open details',
        testID: 'row',
        hitSlop: { top: 8, right: 8, bottom: 8, left: 8 },
        nativeID: 'settings-row',
      });
      expect(restProps.onPress).toBe(props.onPress);
    });
  });

  describe('splitBoxStyles', () => {
    it('separates layout styles from decoration styles', () => {
      const style = {
        marginTop: 10,
        padding: 20,
        backgroundColor: 'blue',
        position: 'absolute' as const,
      };

      const { layoutStyle, decorationStyle } = splitBoxStyles(style);

      expect(layoutStyle).toEqual({ marginTop: 10, position: 'absolute' });
      expect(decorationStyle).toEqual({ padding: 20, backgroundColor: 'blue' });
    });

    it('handles arrays of styles (flattening)', () => {
      const style = [{ flex: 1 }, [{ borderRadius: 5 }, { margin: 10 }]];

      const { layoutStyle, decorationStyle } = splitBoxStyles(style);

      expect(layoutStyle).toEqual({ flex: 1, margin: 10 });
      expect(decorationStyle).toEqual({ borderRadius: 5 });
    });
  });

  describe('resolvePaddingSpacing', () => {
    it('resolves semantic tokens correctly', () => {
      expect(resolvePaddingSpacing('md')).toBe(12);
      expect(resolvePaddingSpacing('xs')).toBe(4);
    });

    it('returns raw numbers as-is', () => {
      expect(resolvePaddingSpacing(42)).toBe(42);
    });

    it('returns undefined for missing values', () => {
      expect(resolvePaddingSpacing(undefined)).toBeUndefined();
    });
  });
});
