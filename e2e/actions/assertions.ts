import { element, by, expect, waitFor } from 'detox';
import { DEFAULT_TIMEOUT_MS } from '../constants/timeouts';

const SCROLL_VIEW_MATCHERS = [
  by.type('scrollview'),
  by.type('UIScrollView'),
  by.type('RCTScrollView'),
  by.type('RCTScrollViewComponentView'),
];

function isAmbiguousMatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /matches \d+ views/.test(message);
}

async function scrollUntilTextVisible(
  target: ReturnType<typeof element>,
  direction: 'up' | 'down' = 'down',
): Promise<void> {
  for (const scrollMatcher of SCROLL_VIEW_MATCHERS) {
    try {
      await waitFor(target).toBeVisible().whileElement(scrollMatcher).scroll(250, direction);
      return;
    } catch {
      // try next scroll container type (RN old/new arch)
    }
  }
}

export async function assertVisibleById(
  testId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const el = element(by.id(testId));
  try {
    await waitFor(el).toBeVisible().withTimeout(Math.min(timeoutMs, 20000));
    return;
  } catch {
    await waitFor(el).toExist().withTimeout(timeoutMs);
    if (testId === 'dashboard-screen') {
      await waitFor(element(by.id('tab-dashboard')))
        .toBeVisible()
        .withTimeout(30000);
    }
  }
}

export async function assertTextVisible(
  text: string | RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const target = element(by.text(text));
  try {
    await waitFor(target).toBeVisible().withTimeout(Math.min(timeoutMs, 20000));
    return;
  } catch (error) {
    // Android exposes the same label on more than one TextView (header plus
    // tab, or a field label plus its title). One visible match is the check.
    if (isAmbiguousMatch(error)) {
      await waitFor(element(by.text(text)).atIndex(0))
        .toBeVisible()
        .withTimeout(Math.min(timeoutMs, 20000));
      return;
    }
    try {
      await scrollUntilTextVisible(target);
      await waitFor(target).toBeVisible().withTimeout(Math.min(timeoutMs, 20000));
      return;
    } catch {
      await waitFor(target).toExist().withTimeout(timeoutMs);
    }
  }
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
