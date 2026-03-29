import React from 'react';
import { SelectionTileList, SelectionTileListProps } from './SelectionTileList';

type FilterChipRowProps = Omit<SelectionTileListProps, 'allowDeselect'>;

export function FilterChipRow(props: FilterChipRowProps) {
    return <SelectionTileList {...props} allowDeselect />;
}
