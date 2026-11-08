/** Deliberately narrow single-mailbox syntax; ambiguous From/To fields remain review-only. */
export function singleMailboxAddress(value: string): string | undefined {
  const unfolded = value.replace(/\r\n[ \t]+/g, ' ').trim();
  if (/[\r\n,;]/.test(unfolded)) return undefined;
  const angle = unfolded.match(/^(?:[^<>]*[ \t])?<([^<>\s]+)>$/);
  const mailbox = (angle?.[1] ?? unfolded).toLowerCase();
  const parts = mailbox.match(/^([a-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([a-z0-9.-]+)$/);
  if (!parts || parts[1].startsWith('.') || parts[1].endsWith('.') || parts[1].includes('..'))
    return undefined;
  const labels = parts[2].split('.');
  if (
    labels.length < 2 ||
    labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    return undefined;
  return mailbox;
}
