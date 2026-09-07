import { DeviceNameStep } from './DeviceNameStep';
import {
  acknowledgeCurrentPrivacyPolicy,
  hasAcknowledgedCurrentPrivacyPolicy,
  subscribeToPrivacyPolicyAcknowledgement,
} from '@/src/services/legal/privacyPolicyAcceptance';
import { analytics } from '@/src/services/analytics';
import { AppConfig } from '@/src/constants/app-config';
import { useState, useSyncExternalStore } from 'react';
import type { DeviceSetupOutput } from './setupTypes';

export function DeviceSetupSlice({
  initialName,
  isCompleting,
  onContinue,
  onRestore,
  onPrivacyNotice,
}: {
  readonly initialName: string;
  readonly isCompleting: boolean;
  readonly onContinue: (output: DeviceSetupOutput) => void;
  readonly onRestore: (name: string) => void;
  readonly onPrivacyNotice: () => void;
}) {
  const [name, setName] = useState(initialName);
  const isPrivacyPolicyAcknowledged = useSyncExternalStore(
    subscribeToPrivacyPolicyAcknowledgement,
    hasAcknowledgedCurrentPrivacyPolicy,
    hasAcknowledgedCurrentPrivacyPolicy,
  );
  return (
    <DeviceNameStep
      name={name}
      setName={setName}
      onContinue={() => onContinue({ displayName: { value: name, source: 'user_entered' } })}
      onRestore={() => onRestore(name)}
      onPrivacyNotice={onPrivacyNotice}
      onAcknowledgePrivacyPolicy={() => {
        acknowledgeCurrentPrivacyPolicy();
        analytics.logPrivacyPolicyAcknowledged(AppConfig.legal.privacyPolicyVersion);
      }}
      isPrivacyPolicyAcknowledged={isPrivacyPolicyAcknowledged}
      isCompleting={isCompleting}
    />
  );
}
