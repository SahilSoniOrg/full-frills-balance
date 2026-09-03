import { Linking } from 'react-native';

export async function openStoreUrl(storeUrl: string): Promise<void> {
  const canOpen = await Linking.canOpenURL(storeUrl);
  if (!canOpen) throw new Error('Store URL cannot be opened');
  await Linking.openURL(storeUrl);
}
