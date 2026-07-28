import { element, by, expect, waitFor } from 'detox';
import { DEFAULT_TIMEOUT_MS } from '../constants/timeouts';

export async function assertVisibleById(
  testId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await waitFor(element(by.id(testId)))
    .toBeVisible()
    .withTimeout(timeoutMs);
}

export async function assertTextVisible(
  text: string | RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await waitFor(element(by.text(text)))
    .toBeVisible()
    .withTimeout(timeoutMs);
}

export async function assertElementTextById(
  testId: string,
  text: string | RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await waitFor(element(by.id(testId)))
    .toBeVisible()
    .withTimeout(timeoutMs);
  if (typeof text === 'string') {
    await expect(element(by.id(testId))).toHaveText(text);
  } else {
    await expect(element(by.id(testId))).toHaveText(text);
  }
}
