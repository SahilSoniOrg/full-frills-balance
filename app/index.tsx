import { Redirect } from 'expo-router';
import { useUser } from '../contexts/UIContext';

export default function IndexScreen() {
  const { hasCompletedOnboarding } = useUser();

  if (hasCompletedOnboarding) {
    return <Redirect href="/accounts" />;
  }

  return <Redirect href="/onboarding" />;
}
