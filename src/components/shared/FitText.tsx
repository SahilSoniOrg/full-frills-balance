import { AppText, type AppTextProps } from '@/src/components/core';
import { useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

/** Fraction of the container the text may fill, so sub-pixel rounding never clips a glyph. */
const FIT_SAFETY = 0.98;

/**
 * Font size that makes text measured at `maxFontSize` fit `availableWidth`.
 * Returns `maxFontSize` until both widths are known; never goes below `minFontSize`.
 */
export function computeFitFontSize({
  maxFontSize,
  minFontSize,
  naturalWidth,
  availableWidth,
}: {
  maxFontSize: number;
  minFontSize: number;
  naturalWidth: number;
  availableWidth: number;
}): number {
  if (!(naturalWidth > 0) || !(availableWidth > 0)) return maxFontSize;
  if (naturalWidth <= availableWidth * FIT_SAFETY) return maxFontSize;
  const scaled = Math.floor(maxFontSize * ((availableWidth * FIT_SAFETY) / naturalWidth));
  return Math.max(minFontSize, Math.min(maxFontSize, scaled));
}

export type FitTextProps = Omit<AppTextProps, 'numberOfLines' | 'adjustsFontSizeToFit'> & {
  maxFontSize: number;
  minFontSize: number;
  /** Line height as a multiple of the fitted font size. */
  lineHeightRatio: number;
};

/**
 * Single-line text that shrinks its font to fit its container width.
 *
 * `adjustsFontSizeToFit` is ignored by react-native-web, and on native it is capped by
 * `minimumFontScale`, so this measures instead: the text lays out unconstrained, its
 * onLayout width gives the natural width, the wrapper's onLayout gives the available
 * width, and font size scales linearly. Works the same on iOS, Android and web.
 */
export function FitText({
  maxFontSize,
  minFontSize,
  lineHeightRatio,
  style,
  children,
  ...textProps
}: FitTextProps) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const fontSize = computeFitFontSize({ maxFontSize, minFontSize, naturalWidth, availableWidth });
  const onContainerLayout = useCallback(
    (e: LayoutChangeEvent) => setAvailableWidth(e.nativeEvent.layout.width),
    [],
  );
  // Text width scales linearly with font size, so the width at the current size tells us
  // the width at maxFontSize without rendering a second copy.
  const onTextLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const width = e.nativeEvent.layout.width;
      if (width > 0) setNaturalWidth(Math.round((width * maxFontSize) / fontSize));
    },
    [maxFontSize, fontSize],
  );

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      <View style={styles.track}>
        <AppText
          {...textProps}
          numberOfLines={1}
          onLayout={onTextLayout}
          style={[style, { fontSize, lineHeight: Math.round(fontSize * lineHeightRatio) }]}
        >
          {children}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clips the wide track; its own width is what the text must fit.
  container: { alignSelf: 'stretch', overflow: 'hidden' },
  // Wide, unconstrained track so the text always lays out at its natural single-line width.
  track: { width: 10000, flexDirection: 'row', alignItems: 'flex-start' },
});
