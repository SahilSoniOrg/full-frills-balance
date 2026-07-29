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
  await target.tap();
  await target.clearText();
  await target.typeText(text);
}

export async function tapByLabel(
  label: string | RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const target = element(by.label(label));
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
  await target.tap();
}

const SCROLL_VIEW_MATCHERS = [
  by.type('UIScrollView'),
  by.type('RCTScrollView'),
  by.type('RCTScrollViewComponentView'),
];

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

export async function scrollToId(testId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const target = element(by.id(testId));
  await waitFor(target).toBeVisible().whileElement(by.type('RCTScrollView')).scroll(200, 'down');
  await waitFor(target).toBeVisible().withTimeout(timeoutMs);
}
