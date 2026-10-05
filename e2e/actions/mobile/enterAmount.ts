import { element, by } from 'detox';
import { tapById, tapByLabel } from './elementActions';

export async function enterAmount(digits: string, testID?: string): Promise<void> {
  if (testID) {
    await tapById(`${testID}-calculator`);
  } else {
    await tapByLabel('Open math calculator');
  }
  for (const digit of digits) {
    await element(by.id(`amount-calculator-key-${digit}`)).tap();
  }
  await tapById('amount-calculator-done');
}
