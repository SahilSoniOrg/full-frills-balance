import { element, by, waitFor } from 'detox';
import { DEFAULT_TIMEOUT_MS } from '../../constants/timeouts';

export async function tapById(testId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const target = element(by.id(testId));
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
  await target.tap();
}

export async function typeById(
  testId: string,
  text: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const target = element(by.id(testId));
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
  await target.replaceText(text);
}

export async function tapByLabel(
  label: string | RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const target = element(by.label(label));
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
  await target.tap();
}

export async function tapByText(
  text: string | RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const target = element(by.text(text));
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
  await target.tap();
}

export async function scrollToId(testId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const target = element(by.id(testId));
  await waitFor(target).toBeVisible().whileElement(by.type('RCTScrollView')).scroll(200, 'down');
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
}
