/** Initials for avatar chips. Default two letters so header and drawer match. */
export function personInitials(name: string, maxChars: 1 | 2 = 2): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return maxChars === 1 ? 'U' : '?';
  if (maxChars === 1) {
    return (Array.from(parts[0])[0] ?? 'U').toLocaleUpperCase();
  }
  const letters =
    parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0].slice(0, 2);
  return letters.toUpperCase();
}
