import { Redirect } from 'expo-router';

export default function LegacyBulkRoute() {
  return <Redirect href="/journal-entry?mode=bulk" />;
}
