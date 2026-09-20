import { AppConfig } from '@/src/constants';
import { BorderWidth, Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, type LayoutChangeEvent } from 'react-native';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type FolderSide = 'left' | 'right';

const SHELF_OFFSET = Spacing.sm;
const CORNER_RADIUS = Shape.radius.lg;
const INNER_FILLET_RADIUS = Shape.radius.md;
const STROKE_WIDTH = BorderWidth.thin;
const INITIAL_TAB_HEIGHT = Size.buttonLg;

const dropdownMeasureStyle = {
  paddingTop: SHELF_OFFSET,
};

const REVEAL_TIMING = {
  duration: AppConfig.animation.normal,
  easing: Easing.out(Easing.cubic),
};

export function buildFolderSvgPath(
  side: FolderSide,
  width: number,
  height: number,
  tabWidth: number,
  shelfY: number,
  radius: number,
  filletRadius: number,
  strokeInset: number,
): string {
  const xLeft = strokeInset;
  const xRight = width - strokeInset;
  const yTop = strokeInset;
  const yBottom = height - strokeInset;

  if (side === 'left') {
    const tabRight = Math.min(tabWidth - strokeInset, xRight - radius * 2);
    const filletEnd = Math.min(tabRight + filletRadius, xRight - radius);

    return [
      `M ${xLeft} ${yTop + radius}`,
      `A ${radius} ${radius} 0 0 1 ${xLeft + radius} ${yTop}`,
      `L ${tabRight - radius} ${yTop}`,
      `A ${radius} ${radius} 0 0 1 ${tabRight} ${yTop + radius}`,
      `L ${tabRight} ${shelfY - filletRadius}`,
      `A ${filletRadius} ${filletRadius} 0 0 0 ${filletEnd} ${shelfY}`,
      `L ${xRight - radius} ${shelfY}`,
      `A ${radius} ${radius} 0 0 1 ${xRight} ${shelfY + radius}`,
      `L ${xRight} ${yBottom - radius}`,
      `A ${radius} ${radius} 0 0 1 ${xRight - radius} ${yBottom}`,
      `L ${xLeft + radius} ${yBottom}`,
      `A ${radius} ${radius} 0 0 1 ${xLeft} ${yBottom - radius}`,
      'Z',
    ].join(' ');
  }

  const tabLeft = Math.max(width - tabWidth + strokeInset, xLeft + radius * 2);
  const filletStart = Math.max(tabLeft - filletRadius, xLeft + radius);

  return [
    `M ${xLeft} ${shelfY + radius}`,
    `A ${radius} ${radius} 0 0 1 ${xLeft + radius} ${shelfY}`,
    `L ${filletStart} ${shelfY}`,
    `A ${filletRadius} ${filletRadius} 0 0 0 ${tabLeft} ${shelfY - filletRadius}`,
    `L ${tabLeft} ${yTop + radius}`,
    `A ${radius} ${radius} 0 0 1 ${tabLeft + radius} ${yTop}`,
    `L ${xRight - radius} ${yTop}`,
    `A ${radius} ${radius} 0 0 1 ${xRight} ${yTop + radius}`,
    `L ${xRight} ${yBottom - radius}`,
    `A ${radius} ${radius} 0 0 1 ${xRight - radius} ${yBottom}`,
    `L ${xLeft + radius} ${yBottom}`,
    `A ${radius} ${radius} 0 0 1 ${xLeft} ${yBottom - radius}`,
    'Z',
  ].join(' ');
}

interface UseFolderLayoutAnimationInput {
  expansionPosition: FolderSide | null;
  activeSide: FolderSide;
}

export function useFolderLayoutAnimation({
  expansionPosition,
  activeSide,
}: UseFolderLayoutAnimationInput) {
  const reduceMotion = useReducedMotion();
  const screenWidth = Dimensions.get('window').width;
  const initialContainerWidth = Math.max(Size.cardMinWidth, screenWidth - Spacing.lg * 2);
  const initialTabWidth = (initialContainerWidth - Size.iconLg - Spacing.xs * 2) / 2;

  const [containerWidth, setContainerWidth] = useState<number>(initialContainerWidth);
  const [tabWidth, setTabWidth] = useState<number>(initialTabWidth);
  const [tabHeight, setTabHeight] = useState<number>(INITIAL_TAB_HEIGHT);
  const [dropdownContentHeight, setDropdownContentHeight] = useState(0);
  const isExpanded = expansionPosition !== null;
  const [holdChrome, setHoldChrome] = useState(isExpanded);
  const revealProgress = useSharedValue(isExpanded ? 1 : 0);

  if (isExpanded && !holdChrome) {
    setHoldChrome(true);
  } else if (reduceMotion && !isExpanded && holdChrome) {
    setHoldChrome(false);
  }

  const isRevealVisible = isExpanded || holdChrome;

  useEffect(() => {
    if (reduceMotion) {
      revealProgress.value = isExpanded ? 1 : 0;
      return;
    }

    revealProgress.value = withTiming(isExpanded ? 1 : 0, REVEAL_TIMING);
    if (isExpanded) return;

    const hideChrome = setTimeout(() => setHoldChrome(false), AppConfig.animation.normal);
    return () => clearTimeout(hideChrome);
  }, [isExpanded, reduceMotion, revealProgress]);

  const onTopRowLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0) setContainerWidth(width);
    if (height > 0) setTabHeight(height);
  }, []);

  const onLeftTabWrapperLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) setTabWidth(width);
  }, []);

  const onDropdownLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) setDropdownContentHeight(height);
  }, []);

  const shelfY = tabHeight + SHELF_OFFSET;
  const effectiveHeight = shelfY + dropdownContentHeight;
  const svgPath = useMemo(() => {
    if (containerWidth <= 0 || effectiveHeight <= shelfY || tabWidth <= 0) return '';

    return buildFolderSvgPath(
      activeSide,
      containerWidth,
      effectiveHeight,
      tabWidth,
      shelfY,
      CORNER_RADIUS,
      INNER_FILLET_RADIUS,
      STROKE_WIDTH / 2,
    );
  }, [activeSide, containerWidth, effectiveHeight, shelfY, tabWidth]);

  const animatedSvgStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
  }));

  return {
    activeSide,
    animatedSvgStyle,
    containerWidth,
    dropdownMeasureStyle,
    effectiveHeight,
    isExpanded,
    isRevealVisible,
    onDropdownLayout,
    onLeftTabWrapperLayout,
    onTopRowLayout,
    reduceMotion,
    svgPath,
  };
}

export const FOLDER_STROKE_WIDTH = STROKE_WIDTH;
