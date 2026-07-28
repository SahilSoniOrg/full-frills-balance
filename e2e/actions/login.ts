import { launchOnboardedApp } from './launch';

export async function launchAndLogin(): Promise<void> {
  await launchOnboardedApp({ seedProfile: 'journal-ready' });
}
