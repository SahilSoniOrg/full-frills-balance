import { AppInput } from '@/src/components/core';
import React from 'react';

interface NotesMetadataFieldProps {
    notes: string;
    setNotes: (value: string) => void;
}

export const NotesMetadataField: React.FC<NotesMetadataFieldProps> = ({
    notes,
    setNotes,
}) => {
    return (
        <AppInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any additional notes..."
            multiline
            numberOfLines={3}
            containerStyle={{ marginBottom: 0 }}
        />
    );
};
