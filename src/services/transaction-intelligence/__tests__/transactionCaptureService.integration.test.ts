import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { preferences } from '@/src/services/preferences';
import { AccountType } from '@/src/types/enums';
import { asWorkplaceId } from '@/src/types/ids';
import { transactionCaptureService } from '../transactionCaptureService';

const workplaceId = asWorkplaceId('capture-account-setup');

beforeEach(async () => {
  await resetDatabase();
  preferences.workplace.clear(workplaceId);
  await accountWriteRepository.create({
    workplaceId,
    name: 'Dollar account',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  preferences.workplace.clear(workplaceId);
});

it('sets up a newly added currency without changing the original cutoff', async () => {
  await transactionCaptureService.setEnabled(workplaceId, true);
  const before = preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture!;
  await accountWriteRepository.create({
    workplaceId,
    name: 'Rupee account',
    accountType: AccountType.ASSET,
    currencyCode: 'INR',
  });
  expect((await transactionCaptureService.getSettings(workplaceId)).needsAccountSetup).toBe(true);

  await transactionCaptureService.configureNewAccounts(workplaceId);
  const after = preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture!;
  expect(after.enabled).toBe(true);
  expect(after.enabledAt).toBe(before.enabledAt);
  expect(after.uncategorizedAccountIds['expense:INR']).toBeTruthy();
  expect(after.uncategorizedAccountIds['income:INR']).toBeTruthy();
  expect((await transactionCaptureService.getSettings(workplaceId)).needsAccountSetup).toBe(false);
  const count = (await accountQueryRepository.findAll(workplaceId)).length;
  await transactionCaptureService.configureNewAccounts(workplaceId);
  expect(await accountQueryRepository.findAll(workplaceId)).toHaveLength(count);
  expect(await database.get<Journal>('journals').query().fetchCount()).toBe(0);
});

it('does not enable capture when role creation fails', async () => {
  jest.spyOn(accountWriteRepository, 'createInSession').mockRejectedValueOnce(new Error('failed'));
  await expect(transactionCaptureService.setEnabled(workplaceId, true)).rejects.toThrow('failed');
  expect((await transactionCaptureService.getSettings(workplaceId)).enabled).toBe(false);
  expect(
    preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture,
  ).toBeUndefined();
});

it('does not re-enable capture when it is disabled during account setup', async () => {
  await transactionCaptureService.setEnabled(workplaceId, true);
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => {
    started = resolve;
  });
  const pause = new Promise<void>(resolve => {
    release = resolve;
  });
  const original = accountQueryRepository.findAll.bind(accountQueryRepository);
  jest.spyOn(accountQueryRepository, 'findAll').mockImplementationOnce(async id => {
    started();
    await pause;
    return original(id);
  });
  const setup = transactionCaptureService.configureNewAccounts(workplaceId);
  await entered;
  const disable = transactionCaptureService.setEnabled(workplaceId, false);
  release();
  await expect(setup).rejects.toThrow(/settings changed/i);
  await disable;
  expect((await transactionCaptureService.getSettings(workplaceId)).enabled).toBe(false);
});

it.each(['enable', 'configure'] as const)(
  'does not carry an in-flight %s operation across a workplace restore',
  async operation => {
    if (operation === 'configure') await transactionCaptureService.setEnabled(workplaceId, true);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => {
      started = resolve;
    });
    const pause = new Promise<void>(resolve => {
      release = resolve;
    });
    const original = accountQueryRepository.findAll.bind(accountQueryRepository);
    jest.spyOn(accountQueryRepository, 'findAll').mockImplementationOnce(async id => {
      started();
      await pause;
      return original(id);
    });
    const pending =
      operation === 'enable'
        ? transactionCaptureService.setEnabled(workplaceId, true)
        : transactionCaptureService.configureNewAccounts(workplaceId);
    await entered;
    preferences.workplace.replace(workplaceId, {
      automaticTransactionCapture: { enabled: false, uncategorizedAccountIds: {} },
    });
    release();
    await expect(pending).rejects.toThrow(/settings changed/i);
    expect((await transactionCaptureService.getSettings(workplaceId)).enabled).toBe(false);
  },
);
