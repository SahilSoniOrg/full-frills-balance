// Gmail capture is native-only; web must not accept an unverified signature.
export function sha256Base64(_data: Uint8Array): string {
  return '';
}
export function verifyRsaSha256(_key: string, _data: Uint8Array, _signature: Uint8Array): boolean {
  return false;
}
