export type WebKeyCryptoCapability = 'ready' | 'unavailable' | 'not-web';

export async function probeWebKeyCryptoCapability(): Promise<WebKeyCryptoCapability> {
  return 'not-web';
}
