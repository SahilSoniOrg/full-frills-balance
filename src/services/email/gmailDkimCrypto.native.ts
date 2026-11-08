import QuickCrypto from 'react-native-quick-crypto';

export function sha256Base64(data: Uint8Array): string {
  return QuickCrypto.createHash('sha256').update(data).digest('base64');
}

export function verifyRsaSha256(
  publicKeyBase64: string,
  data: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    const encoded = publicKeyBase64.match(/.{1,64}/g)?.join('\n');
    if (!encoded) return false;
    let key;
    try {
      key = QuickCrypto.createPublicKey(
        `-----BEGIN PUBLIC KEY-----\n${encoded}\n-----END PUBLIC KEY-----`,
      );
    } catch {
      key = QuickCrypto.createPublicKey(
        `-----BEGIN RSA PUBLIC KEY-----\n${encoded}\n-----END RSA PUBLIC KEY-----`,
      );
    }
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
      return false;
    return QuickCrypto.createVerify('RSA-SHA256').update(data).verify(key, signature);
  } catch {
    return false;
  }
}
