/** Copies so a looping wheel can scroll past either end of one cycle. */
export function repeatingCopyCount(cycleLength: number): number {
  if (cycleLength <= 0) return 1;
  return Math.max(3, Math.ceil(24 / cycleLength));
}

export function repeatingIndexForValue(
  valueIndex: number,
  cycleLength: number,
  copies: number,
): number {
  if (cycleLength <= 0) return 0;
  return (
    Math.floor(copies / 2) * cycleLength +
    (((valueIndex % cycleLength) + cycleLength) % cycleLength)
  );
}

/** Map an index in the first or last copy onto the matching middle-copy index. */
export function recenterRepeatingIndex(index: number, cycleLength: number, copies: number): number {
  if (cycleLength <= 0 || copies <= 1) return index;
  const valueIndex = ((index % cycleLength) + cycleLength) % cycleLength;
  const band = Math.floor(index / cycleLength);
  if (band <= 0 || band >= copies - 1) {
    return repeatingIndexForValue(valueIndex, cycleLength, copies);
  }
  return index;
}
