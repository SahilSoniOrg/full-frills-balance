/** Keep schedule counts within the calendar's supported date range, including yearly rules. */
export function isValidRepeatCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 9999;
}
