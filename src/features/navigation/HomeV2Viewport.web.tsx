import { useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { HomeV2Subtabs } from './HomeV2Subtabs';
import { PrimaryPagerPageContent } from './PrimaryPagerPageContent';
import type { PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';

/** Explicit web navigation shares the native header's visual progress contract. */
export function HomeV2Viewport({
  pages,
  committedIndex,
  mountedIndices,
  pageProgress,
}: PrimaryPagerViewportProps) {
  useLayoutEffect(() => {
    pageProgress.set(committedIndex);
  }, [committedIndex, pageProgress]);
  return (
    <View style={styles.viewport}>
      {pages.map((page, index) => {
        const active = index === committedIndex;
        return (
          <View
            key={page.name}
            style={[StyleSheet.absoluteFill, !active && styles.hiddenPage]}
            pointerEvents={active ? 'auto' : 'none'}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
          >
            {mountedIndices.has(index) || active ? (
              <>
                <HomeV2Subtabs routeName={page.name} />
                <View style={styles.body}>
                  <PrimaryPagerPageContent page={page} />
                </View>
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, position: 'relative' },
  body: { flex: 1 },
  hiddenPage: { display: 'none' },
});
