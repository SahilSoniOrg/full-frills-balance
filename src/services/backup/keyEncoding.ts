export function keyHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function keyBytes(value: string, length = 32): Uint8Array {
  if (!new RegExp(`^[a-f0-9]{${length * 2}}$`, 'i').test(value))
    throw new Error('Invalid key encoding');
  return Uint8Array.from(value.match(/../g) ?? [], pair => parseInt(pair, 16));
}

export function boundedBase64(value: string, maximum: number): Uint8Array {
  if (
    value.length > Math.ceil(maximum / 3) * 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('Invalid or oversized ciphertext');
  const binary = atob(value);
  if (binary.length > maximum) throw new Error('Oversized ciphertext');
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
