import { AppInput } from '@/src/components/core';
import React from 'react';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';

interface NotesMetadataFieldProps {
  notes: string;
  setNotes: (value: string) => void;
  testID?: string;
  label?: string;
}

export const NotesMetadataField: React.FC<NotesMetadataFieldProps> = ({
  notes,
  setNotes,
  testID,
  label = copy.legacyNotes,
}) => {
  return (
    <AppInput
      label={label}
      value={notes}
      onChangeText={setNotes}
      placeholder={copy.notePlaceholder}
      testID={testID}
      multiline
      numberOfLines={3}
      containerStyle={{ marginBottom: 0 }}
    />
  );
};
