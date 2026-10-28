import { StyleSheet, View } from 'react-native';
import { PrimaryPageGestureProvider } from '@/src/navigation/primaryPageNavigation';
import type { PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';

export function PrimaryPagerViewport({
  pages,
  committedIndex,
  mountedIndices,
}: PrimaryPagerViewportProps) {
  return (
    <PrimaryPageGestureProvider value={null}>
      <View style={styles.viewport}>
        {pages.map((page, index) => {
          const active = index === committedIndex;
          return (
            <View
              key={page.key}
              style={[StyleSheet.absoluteFill, !active && styles.hiddenPage]}
              pointerEvents={active ? 'auto' : 'none'}
              accessibilityElementsHidden={!active}
              importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            >
              {mountedIndices.has(index) || active ? page.render() : null}
            </View>
          );
        })}
      </View>
    </PrimaryPageGestureProvider>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, position: 'relative' },
  hiddenPage: { display: 'none' },
});
