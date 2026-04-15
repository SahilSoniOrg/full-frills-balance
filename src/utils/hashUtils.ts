/**
 * DJB2 string hash. Returns a 32-bit integer.
 * Used for lightweight structural fingerprinting (cache keys, dedup).
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
