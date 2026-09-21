import { AppConfig } from '@/src/constants';
import { render, screen } from '@/src/utils/test-utils';
import React from 'react';
import { AdvancedForm } from '../components/AdvancedForm';

jest.mock('../components/JournalLineItem', () => ({
  JournalLineItem: () => null,
}));

describe('AdvancedForm', () => {
  it('renders the configured advanced-entry introduction', () => {
    const editor = {
      lines: [],
      addLine: jest.fn(),
      updateLine: jest.fn(),
      removeLine: jest.fn(),
      fetchRatesForLines: jest.fn(),
      balanceLine: jest.fn(),
      isUnbalanced: false,
      isEntryReadyToBalance: false,
    } as unknown as React.ComponentProps<typeof AdvancedForm>['editor'];

    render(
      <AdvancedForm
        editor={editor}
        workplaceCurrency="USD"
        journalBaseCurrency="USD"
        getLineBaseAmount={jest.fn()}
        onSelectAccountRequest={jest.fn()}
      />,
    );

    expect(JSON.stringify(screen.toJSON())).toContain(AppConfig.strings.advancedEntry.intro);
  });
});
