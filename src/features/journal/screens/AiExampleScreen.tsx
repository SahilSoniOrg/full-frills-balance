import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AiExampleView } from '@/src/features/journal/components/AiExampleView';
import { Redirect } from 'expo-router';

const chrome: ScreenNavChrome = {
  screenTitle: 'Example Replica',
  showBack: true,
  backIcon: 'back',
};

export default function AiExampleScreen() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return <AiExampleView chrome={chrome} />;
}
