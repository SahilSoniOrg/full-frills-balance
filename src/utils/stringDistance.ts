/**
 * Levenshtein distance and string similarity metrics.
 */

export function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  let i: number;
  let j: number;
  let val: number;

  for (i = 0; i <= a.length; i++) {
    tmp.push([i]);
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        val = 0;
      } else {
        val = 1;
      }
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // deletion
        tmp[i][j - 1] + 1, // insertion
        tmp[i - 1][j - 1] + val, // substitution
      );
    }
  }
  return tmp[a.length][b.length];
}

export function getStringSimilarity(a: string, b: string): number {
  const distance = getLevenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1.0;
  return 1.0 - distance / maxLength;
}
