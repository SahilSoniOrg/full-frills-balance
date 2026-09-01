import { DeviceNameStep } from './DeviceNameStep';
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
  readonly onRestore: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <DeviceNameStep
      name={name}
      setName={setName}
      onContinue={() => onContinue({ displayName: { value: name, source: 'user_entered' } })}
      onRestore={() => onRestore(name)}
      isCompleting={isCompleting}
    />
  );
}
