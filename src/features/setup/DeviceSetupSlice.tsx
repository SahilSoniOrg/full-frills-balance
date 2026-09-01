import { StepSplash } from '@/src/features/onboarding';
import { useState } from 'react';
import type { DeviceSetupOutput } from './setupTypes';

export function DeviceSetupSlice({
  initialName,
  isCompleting,
  onContinue,
  onRestore,
}: {
  readonly initialName: string;
  readonly isCompleting: boolean;
  readonly onContinue: (output: DeviceSetupOutput) => void;
  readonly onRestore: () => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <StepSplash
      name={name}
      setName={setName}
      onContinue={() => onContinue({ displayName: { value: name, source: 'user_entered' } })}
      onRestore={onRestore}
      isCompleting={isCompleting}
    />
  );
}
