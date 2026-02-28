// Reexport the native module. On web, it will be resolved to ExpoSmsInboxModule.web.ts
// and on native platforms to ExpoSmsInboxModule.ts
export * from './src/ExpoSmsInbox.types';
export { default } from './src/ExpoSmsInboxModule';

