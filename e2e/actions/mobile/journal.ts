/**
 * Detox helpers for guided journal entry (`activeMode === 'guided'` → `SimpleForm`).
 *
 * App structure (see `JournalEntryView`, `SimpleForm`, `buildSimpleFormAccountSections`):
 * - Description in scroll body (`journal-description-input`)
 * - Expense / Income / Transfer tabs (`SimpleFormTabs`); new entry defaults to expense
 * - For expense, account sections in order: “To Category” (destination), then “From Account” (source)
 * - Each section: horizontal tiles (`account-option-*`) or “Browse all” → `AccountPickerModal`
 * - Amount is in the sticky footer (`amount-input` on `SubmitFooter`, not in the scroll area)
 * - Save uses `submit-footer-button`; when amount field is focused, first tap dismisses keyboard (“Continue”)
 */
import { element, by, waitFor } from 'detox';
import { journal, tabs } from '../../screens';
import { LONG_TIMEOUT_MS } from '../../constants/timeouts';
import { assertVisibleById, assertTextVisible } from '../assertions';
import { tapById, tapByLabel, typeById } from './elementActions';

const SECTION_TITLE = {
  destination: 'To Category',
  source: 'From Account',
} as const;

type AccountRole = keyof typeof SECTION_TITLE;

async function openGuidedJournalEntry(): Promise<void> {
  await tapById(tabs.activity);
  await waitFor(element(by.label('Open new entry options')))
    .toBeVisible()
    .withTimeout(LONG_TIMEOUT_MS);
  await tapByLabel('Open new entry options', LONG_TIMEOUT_MS);

  await assertVisibleById(journal.screen, LONG_TIMEOUT_MS);
  await assertVisibleById(journal.browseForRole('destination'), LONG_TIMEOUT_MS);
  await assertVisibleById(journal.browseForRole('source'), LONG_TIMEOUT_MS);
  await assertTextVisible(SECTION_TITLE.destination, LONG_TIMEOUT_MS);
  await assertTextVisible(SECTION_TITLE.source, LONG_TIMEOUT_MS);
}

async function selectAccountOnTile(accountName: string): Promise<boolean> {
  try {
    const tile = element(by.text(accountName));
    await waitFor(tile).toBeVisible().withTimeout(5000);
    await tile.atIndex(0).tap();
    return true;
  } catch {
    return false;
  }
}

/** Opens `AccountPickerModal` via section “Browse all” (`journal-browse-{role}`). */
async function tapBrowseForRole(role: AccountRole): Promise<void> {
  const browse = element(by.id(journal.browseForRole(role)));
  try {
    await waitFor(browse).toBeVisible().withTimeout(10000);
  } catch {
    await waitFor(browse).toBeVisible().whileElement(by.type('UIScrollView')).scroll(300, 'down');
  }
  await browse.tap();
}

async function selectAccountViaBrowse(role: AccountRole, accountName: string): Promise<void> {
  await assertTextVisible(SECTION_TITLE[role], 15000);

  if (await selectAccountOnTile(accountName)) {
    return;
  }

  await tapBrowseForRole(role);
  await assertTextVisible('Select Account', 20000);

  const search = element(by.id(journal.accountPickerSearch));
  await waitFor(search).toBeVisible().withTimeout(30000);
  await search.tap();
  await search.clearText();
  await search.replaceText(accountName);

  const row = element(by.label(accountName));
  await waitFor(row).toBeVisible().withTimeout(45000);
  await row.atIndex(0).tap();
}

async function saveGuidedJournalEntry(): Promise<void> {
  // Blur amount so submit saves instead of acting as “Continue” (see `isJournalEntrySubmitDisabled`).
  await element(by.id(journal.descriptionInput)).tap();

  const submit = element(by.id(journal.submitFooter));
  await waitFor(submit).toBeVisible().withTimeout(60000);
  await submit.tap();

  await waitFor(element(by.id(journal.screen)))
    .not.toBeVisible()
    .withTimeout(60000);
}

export type GuidedExpenseJournalInput = {
  amount: string;
  description: string;
  categoryName: string;
  fromAccountName: string;
};

/**
 * Creates a guided expense journal entry from Activity and asserts the description on the list.
 */
export async function createGuidedExpenseJournal(input: GuidedExpenseJournalInput): Promise<void> {
  await openGuidedJournalEntry();

  await typeById(journal.descriptionInput, input.description);

  // Expense simple form section order (destination then source).
  await selectAccountViaBrowse('destination', input.categoryName);
  await waitFor(element(by.text(SECTION_TITLE.source)))
    .toBeVisible()
    .whileElement(by.type('UIScrollView'))
    .scroll(250, 'down');
  await selectAccountViaBrowse('source', input.fromAccountName);

  await typeById(journal.amountInput, input.amount);

  await saveGuidedJournalEntry();

  await tapById(tabs.activity);
  await assertTextVisible(input.description, LONG_TIMEOUT_MS);
}
