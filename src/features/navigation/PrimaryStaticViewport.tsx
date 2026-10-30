import { StyleSheet, View } from 'react-native';
import type { PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';
import { PrimaryPagerPageContent } from './PrimaryPagerPageContent';

/** Classic navigation: retained scenes, immediate tab changes, no horizontal recognizer. */
export function PrimaryStaticViewport({
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
            key={page.name}
            style={[StyleSheet.absoluteFill, !active && styles.hidden]}
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
  hidden: { display: 'none' },
});
