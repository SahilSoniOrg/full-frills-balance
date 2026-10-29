import { memo } from 'react';
import type { PrimaryPagerPage } from './PrimaryPagerViewport.types';

/** Gesture state can update the viewport without rebuilding retained screens. */
export const PrimaryPagerPageContent = memo(function PrimaryPagerPageContent({
  page,
}: {
  page: PrimaryPagerPage;
}) {
  return page.render();
});
