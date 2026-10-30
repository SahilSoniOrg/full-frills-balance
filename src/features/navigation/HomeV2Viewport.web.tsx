import { useLayoutEffect, useMemo } from 'react';
import { View } from 'react-native';
import { HomeV2Subtabs } from './HomeV2Subtabs';
import { PrimaryPagerViewport } from './PrimaryPagerViewport.web';
import type { PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';

/** Explicit web navigation shares the native header's visual progress contract. */
export function HomeV2Viewport(props: PrimaryPagerViewportProps) {
  const { committedIndex, pageProgress } = props;
  useLayoutEffect(() => {
    pageProgress.set(committedIndex);
  }, [committedIndex, pageProgress]);
  const pages = useMemo(
    () =>
      props.pages.map(page => ({
        ...page,
        render: () => (
          <View style={{ flex: 1 }}>
            <HomeV2Subtabs routeName={page.name} />
            <View style={{ flex: 1 }}>{page.render()}</View>
          </View>
        ),
      })),
    [props.pages],
  );
  return <PrimaryPagerViewport {...props} pages={pages} />;
}
