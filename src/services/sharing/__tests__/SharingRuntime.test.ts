import { SharingRuntime, type ShareTransport } from '../SharingRuntime';
import { ShareFormat, type Shareable, type ShareWritable } from '@/src/types/sharing';
import { asWorkplaceId } from '@/src/types/ids';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const transport: ShareTransport = {
    reserveDestination: jest.fn(async () => undefined),
    deliver: jest.fn(async () => ({ kind: 'handed-off' as const })),
    retain: jest.fn(),
  };
  const source: Shareable = {
    id: 'example',
    title: 'Example',
    filename: 'example',
    scope: { kind: 'workplace', workplaceId: asWorkplaceId('home') },
    supportedFormats: [ShareFormat.CSV],
    prepare: jest.fn(async () => ({ kind: 'text' as const, content: 'amount\n12' })),
  };
  return { transport, source, runtime: new SharingRuntime(transport) };
}

const request = { action: 'share' as const, format: ShareFormat.CSV };

it('rejects competing actions before preparing their content and releases ownership', async () => {
  const { runtime, source, transport } = fixture();
  const gate = deferred<void>();
  transport.deliver = jest.fn(async () => {
    await gate.promise;
    return { kind: 'handed-off' as const };
  });
  const first = runtime.execute(source, request);
  const competing = { ...source, prepare: jest.fn(source.prepare) };
  await expect(runtime.execute(competing, request)).resolves.toEqual({ kind: 'busy' });
  expect(competing.prepare).not.toHaveBeenCalled();
  gate.resolve();
  await expect(first).resolves.toEqual({ kind: 'handed-off' as const });
  expect(runtime.getSnapshot().phase).toBe('idle');
});

it('fails unsupported explicit formats without reading data', async () => {
  const { runtime, source } = fixture();
  await expect(
    runtime.execute(source, { ...request, format: ShareFormat.ZIP }),
  ).resolves.toMatchObject({ kind: 'failed' });
  expect(source.prepare).not.toHaveBeenCalled();
});

it('prevents handoff after a Workplace transition during preparation', async () => {
  const { runtime, source, transport } = fixture();
  const gate = deferred<void>();
  source.prepare = async () => {
    await gate.promise;
    return { kind: 'text', content: 'private' };
  };
  const operation = runtime.execute(source, request);
  const release = runtime.beginWorkplaceTransition(asWorkplaceId('home'), 'switch');
  gate.resolve();
  await expect(operation).resolves.toEqual({ kind: 'cancelled' });
  expect(transport.deliver).not.toHaveBeenCalled();
  release();
});

it('preserves explicit multi-Workplace backups across an unrelated switch', async () => {
  const { runtime, source } = fixture();
  source.scope = { kind: 'workplaces', workplaceIds: [asWorkplaceId('home')] };
  const release = runtime.beginWorkplaceTransition(asWorkplaceId('home'), 'switch');
  await expect(runtime.execute(source, request)).resolves.toEqual({ kind: 'handed-off' as const });
  release();
  const deleted = runtime.beginWorkplaceTransition(asWorkplaceId('home'), 'delete');
  await expect(runtime.execute(source, request)).resolves.toEqual({ kind: 'cancelled' });
  deleted();
});

it('cleans up prepared files after delivery failure and permits a retry', async () => {
  const { runtime, source, transport } = fixture();
  const cleanup = jest.fn();
  source.prepare = async () => ({ kind: 'file', uri: 'file:///export.csv', cleanup });
  transport.deliver = async () => {
    throw new Error('Unavailable');
  };
  await expect(runtime.execute(source, request)).resolves.toMatchObject({ kind: 'failed' });
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(runtime.getSnapshot().operationId).toBeNull();
});

it('does not depend on React or a mounted Workplace for device diagnostics', async () => {
  const { runtime, source } = fixture();
  runtime.setLifecycle({ ready: false, locked: false, restartRequired: true });
  source.scope = { kind: 'device' };
  await expect(runtime.execute(source, request)).resolves.toEqual({ kind: 'handed-off' as const });
});

it.each(['lock', 'switch', 'delete', 'dispose'] as const)(
  'remembers %s cancellation until a destination picker returns and aborts its writer',
  async reason => {
    const { runtime, source, transport } = fixture();
    const picker = deferred<ShareWritable>();
    const controller = new AbortController();
    const destination: ShareWritable = {
      write: jest.fn(),
      close: jest.fn(),
      abort: jest.fn(async () => {}),
    };
    runtime.setLifecycle({ ready: true, locked: false, restartRequired: false });
    transport.reserveDestination = (_source, _request, context) =>
      context.present('selecting-destination', () => picker.promise);
    const operation = runtime.execute(source, request, controller.signal);
    expect(runtime.getSnapshot().phase).toBe('selecting-destination');

    if (reason === 'lock') {
      runtime.setLifecycle({ ready: true, locked: true, restartRequired: false });
      runtime.setLifecycle({ ready: true, locked: false, restartRequired: false });
    } else if (reason === 'dispose') {
      controller.abort();
    } else {
      runtime.beginWorkplaceTransition(asWorkplaceId('home'), reason)();
    }

    picker.resolve(destination);
    await expect(operation).resolves.toEqual({ kind: 'cancelled' });
    expect(source.prepare).not.toHaveBeenCalled();
    expect(transport.deliver).not.toHaveBeenCalled();
    expect(destination.abort).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().phase).toBe('idle');
  },
);

it('allows the application-owned picker to become inactive without losing its operation', async () => {
  const { runtime, source, transport } = fixture();
  transport.reserveDestination = (_source, _request, context) =>
    context.present('selecting-destination', async () => {
      runtime.setLifecycle({ ready: true, locked: false, active: false, restartRequired: false });
      runtime.setLifecycle({ ready: true, locked: false, active: true, restartRequired: false });
      return undefined;
    });
  await expect(runtime.execute(source, request)).resolves.toEqual({ kind: 'handed-off' });
});

it('does not resume work from a confirmation after a transient lock', async () => {
  const { runtime, source, transport } = fixture();
  const continued = jest.fn();
  transport.deliver = async (_source, _artifact, _request, context) => {
    await context.present('awaiting-user', async () => {
      runtime.setLifecycle({ ready: true, locked: true, restartRequired: false });
      runtime.setLifecycle({ ready: true, locked: false, restartRequired: false });
    });
    continued();
    return { kind: 'handed-off' };
  };
  await expect(runtime.execute(source, request)).resolves.toEqual({ kind: 'cancelled' });
  expect(continued).not.toHaveBeenCalled();
});

it('preserves a completed native handoff even when its owner unmounts during presentation', async () => {
  const { runtime, source, transport } = fixture();
  const controller = new AbortController();
  const cleanup = jest.fn();
  source.prepare = async () => ({ kind: 'file', uri: 'file:///export.csv', cleanup });
  transport.deliver = (_source, _artifact, _request, context) =>
    context.present('delivering', async () => {
      controller.abort();
      runtime.setLifecycle({ ready: true, locked: true, restartRequired: false });
      return { kind: 'handed-off' as const };
    });
  await expect(runtime.execute(source, request, controller.signal)).resolves.toEqual({
    kind: 'handed-off',
  });
  expect(transport.retain).toHaveBeenCalled();
  expect(cleanup).not.toHaveBeenCalled();
});
