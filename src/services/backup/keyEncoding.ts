export function keyHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function keyBytes(value: string, length = 32): Uint8Array {
  if (!new RegExp(`^[a-f0-9]{${length * 2}}$`).test(value)) throw new Error('Invalid key encoding');
  return Uint8Array.from(value.match(/../g) ?? [], pair => parseInt(pair, 16));
}
