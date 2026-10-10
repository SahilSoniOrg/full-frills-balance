import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppText, type AppTextProps } from '@/src/components/core';
import { useCallback, useState } from 'react';

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
  /** Style for the measuring wrapper, e.g. `{ flex: 1 }` when the text sits in a row. */
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * Size the wrapper to the fitted text (capped at the parent's width) instead of stretching.
   * Use in rows where siblings sit beside the amount, e.g. "₹12,000 left of ₹20,000".
   */
  hug?: boolean;
};

/** Font-size bounds for FitText, so wrappers (e.g. MoneyText) can opt in with one prop. */
export type FitTextSizing = Pick<
  FitTextProps,
  'maxFontSize' | 'minFontSize' | 'lineHeightRatio' | 'containerStyle' | 'hug'
>;

/** Track width; far wider than any screen so the text never wraps or truncates while measuring. */
const TRACK_WIDTH = 10000;

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
  align = 'left',
  containerStyle,
  hug = false,
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

  // The track is far wider than the container, so centre / right alignment is done by
  // offsetting the track against the measured container width rather than by flexbox.
  const trackOffset =
    availableWidth > 0 && (align === 'center' || align === 'right')
      ? align === 'center'
        ? (availableWidth - TRACK_WIDTH) / 2
        : availableWidth - TRACK_WIDTH
      : 0;
  const justifyContent =
    align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

  // Hug: ask for the text's full width at maxFontSize (plus the safety margin). In a wrapping
  // row it moves to its own line when that doesn't fit; maxWidth / flexShrink then cap it at
  // the room left and the font shrinks into it. Basing this on the fitted size instead would
  // let the wrapper and the font shrink each other down to minFontSize.
  const hugStyle: ViewStyle | undefined = hug
    ? {
        alignSelf: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'auto',
        maxWidth: '100%',
        flexShrink: 1,
        width: Math.ceil(naturalWidth / FIT_SAFETY) + 1,
      }
    : undefined;

  return (
    <View style={[styles.container, hugStyle, containerStyle]} onLayout={onContainerLayout}>
      <View style={[styles.track, { marginLeft: trackOffset, justifyContent }]}>
        <AppText
          {...textProps}
          align={align}
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
  track: { width: TRACK_WIDTH, flexDirection: 'row', alignItems: 'flex-start' },
});
