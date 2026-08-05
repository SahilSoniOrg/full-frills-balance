import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AiBenchmarkView } from '@/src/features/journal/components/AiBenchmarkView';

const chrome: ScreenNavChrome = {
  screenTitle: 'AI Benchmarking',
  showBack: true,
  backIcon: 'back',
};

export default function AiBenchmarkScreen() {
  return <AiBenchmarkView chrome={chrome} />;
}
