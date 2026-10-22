import { PlatformShareTransport } from './sharing/ShareTransport';
import { SharingRuntime } from './sharing/SharingRuntime';
export { FileSharingUnavailableError } from './sharing/ShareTransport';

const transport = new PlatformShareTransport();
export const sharingRuntime = new SharingRuntime(transport);

/** Imperative recovery facade and React hooks share this exact runtime instance. */
export const sharingService = {
  execute: sharingRuntime.execute,
  init: () => transport.init(),
};
