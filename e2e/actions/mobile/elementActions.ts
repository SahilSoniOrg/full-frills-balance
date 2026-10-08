import { element, by, waitFor } from 'detox';
import { DEFAULT_TIMEOUT_MS } from '../../constants/timeouts';

export async function tapById(testId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const target = element(by.id(testId));
  try {
    await waitFor(target).toBeVisible().withTimeout(Math.min(timeoutMs, 8000));
  } catch {
    await scrollToId(testId, timeoutMs);
  }
  await target.tap();
}

export async function typeById(
  testId: string,
  text: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const target = element(by.id(testId));
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
  await target.tap();
  await target.clearText();
  await target.typeText(text);
}

export async function replaceById(
  testId: string,
  text: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const target = element(by.id(testId));
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
  await target.tap();
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

// Detox maps this semantic type to UIScrollView on iOS and Android ScrollView /
// ReactScrollView. Raw iOS class names do not match on Android, so off-screen
// rows never scrolled into view.
const SCROLL_VIEW_MATCHERS = [by.type('scrollview')];

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

export async function tapByText(
  text: string | RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const target = element(by.text(text));
  try {
    await waitFor(target).toBeVisible().withTimeout(timeoutMs);
  } catch {
    await scrollUntilTextVisible(target);
    await waitFor(target).toBeVisible().withTimeout(timeoutMs);
  }
  await target.tap();
}

/** Visible text that Android may render as more than one TextView. */
export async function waitForVisibleText(
  text: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await waitFor(element(by.text(text)).atIndex(0))
    .toBeVisible()
    .withTimeout(timeoutMs);
}

export async function scrollToId(testId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const target = element(by.id(testId));
  for (const scrollMatcher of SCROLL_VIEW_MATCHERS) {
    try {
      await waitFor(target).toBeVisible().whileElement(scrollMatcher).scroll(200, 'down');
      await waitFor(target).toBeVisible().withTimeout(timeoutMs);
      return;
    } catch {
      // Try the next native scroll view class used by the current RN architecture.
    }
  }
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
}
