import { StyleSheet, View } from 'react-native';
import type { PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';
import { PrimaryPagerPageContent } from './PrimaryPagerPageContent';

export function PrimaryPagerViewport({
  pages,
  committedIndex,
  mountedIndices,
}: PrimaryPagerViewportProps) {
  return (
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
            {mountedIndices.has(index) || active ? <PrimaryPagerPageContent page={page} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, position: 'relative' },
  hiddenPage: { display: 'none' },
});
