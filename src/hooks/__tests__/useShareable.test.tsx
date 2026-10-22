import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { SharingProvider } from '@/src/contexts/SharingContext';
import { SharingRuntime, type ShareTransport } from '@/src/services/sharing/SharingRuntime';
import { ShareFormat, type ShareOutcome, type Shareable } from '@/src/types/sharing';
import { useShareable } from '../useShareable';

jest.mock('@/src/services/SharingService', () => ({
  sharingRuntime: null,
  FileSharingUnavailableError: class extends Error {},
}));
jest.mock('@/src/hooks/useSharePrefs', () => ({
  useSharePrefs: () => ({ defaultShareFormat: 'TEXT' }),
}));
jest.mock('@/src/utils/alerts', () => ({ toast: {} }));
jest.mock('@/src/utils/logger', () => ({ logger: { error: jest.fn() } }));

it('keeps ownership while hiding preparation UI during confirmation and ignores unrelated progress', async () => {
  let finishPreparation!: () => void;
  let confirm!: () => void;
  let reportProgress!: (message: string) => void;
  const preparing = new Promise<void>(resolve => {
    finishPreparation = resolve;
  });
  const confirmation = new Promise<void>(resolve => {
    confirm = resolve;
  });
  const transport: ShareTransport = {
    reserveDestination: async () => undefined,
    deliver: async (_source, _artifact, _request, context) => {
      await context.present('awaiting-user', () => confirmation);
      return { kind: 'saved' };
    },
    retain: jest.fn(),
  };
  const runtime = new SharingRuntime(transport);
  const source: Shareable = {
    id: 'owner',
    title: 'Owner',
    filename: 'owner',
    scope: { kind: 'device' },
    supportedFormats: [ShareFormat.TEXT],
    prepare: async (_format, context) => {
      reportProgress = context.reportProgress;
      await preparing;
      return { kind: 'text', content: 'data' };
    },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SharingProvider runtime={runtime}>{children}</SharingProvider>
  );
  const owner = renderHook(() => useShareable(source, { notify: false }), { wrapper });
  const renderUnrelated = jest.fn();
  const unrelated = renderHook(
    () => {
      renderUnrelated();
      return useShareable(null, { notify: false });
    },
    { wrapper },
  );
  let operation!: Promise<ShareOutcome>;
  await act(async () => {
    operation = owner.result.current.save();
  });
  expect(owner.result.current.isPending).toBe(true);
  expect(owner.result.current.isPreparing).toBe(true);
  expect(unrelated.result.current.isBusy).toBe(true);
  const rendersAtStart = renderUnrelated.mock.calls.length;

  act(() => {
    reportProgress('500 rows');
  });
  expect(owner.result.current.progress?.message).toBe('500 rows');
  expect(renderUnrelated).toHaveBeenCalledTimes(rendersAtStart);

  await act(async () => {
    finishPreparation();
  });
  expect(runtime.getSnapshot().phase).toBe('awaiting-user');
  expect(owner.result.current.isPending).toBe(true);
  expect(owner.result.current.isPreparing).toBe(false);
  expect(renderUnrelated).toHaveBeenCalledTimes(rendersAtStart);

  await act(async () => {
    confirm();
    await operation;
  });
  expect(owner.result.current.isPending).toBe(false);
  expect(unrelated.result.current.isBusy).toBe(false);
});
