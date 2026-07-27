import { AiExampleView } from '@/src/features/journal';
import { Redirect } from 'expo-router';

export default function AiExampleScreen() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <AiExampleView />;
}
