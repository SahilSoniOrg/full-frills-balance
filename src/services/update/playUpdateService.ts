import type { PlayUpdateAdapter } from './playUpdateTypes';

/** Unsupported platforms never load the Android TurboModule. */
export const playUpdateService: PlayUpdateAdapter = {
  check: async () => null,
  start: async () => {
    throw new Error('Native updates are unavailable');
  },
  install: async () => {
    throw new Error('Native updates are unavailable');
  },
  subscribe: () => () => {},
};
