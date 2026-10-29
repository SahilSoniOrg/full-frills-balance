import type { SharedValue } from 'react-native-reanimated';

export type PrimaryPagerPage = {
  key: string;
  name: string;
  render: () => React.ReactNode;
};

export type PrimaryPagerViewportProps = {
  pages: readonly PrimaryPagerPage[];
  committedIndex: number;
  mountedIndices: ReadonlySet<number>;
  isTransitioning: boolean;
  reduceMotion: boolean;
  scrollEnabled: boolean;
  pageProgress: SharedValue<number>;
  onPageSelected: (index: number) => void;
  onTransitioningChange: (transitioning: boolean) => void;
  /** iOS leading-edge overscroll on Dashboard opens the drawer. */
  onLeadingOverscrollOpen?: () => void;
};
