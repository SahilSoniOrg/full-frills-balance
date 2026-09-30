import type { PropsWithChildren } from 'react';
import { render } from '@testing-library/react-native';
import { AuditLogChangesView } from '@/src/features/audit/components/AuditLogChangesView';
import { createAuditEventPayload, getAuditEventFieldDeltas } from '@/src/types/auditEvents';
import { getAuditFieldDiff } from '@/src/features/audit/auditLogTypes';
import { AuditAction } from '@/src/types/enums';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
jest.mock('@/src/components/core', () => ({
  AppText: ({ children }: PropsWithChildren) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{children}</Text>;
  },
  AppIcon: () => null,
  Icon: {},
}));
jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      surfaceSecondary: '#fff',
      divider: '#ddd',
      success: '#0f0',
      error: '#f00',
      textSecondary: '#777',
    },
  }),
}));
jest.mock('@/src/hooks/useHourCyclePrefs', () => ({
  useHourCyclePrefs: () => ({ resolvedHourCycle: '24h' }),
}));
test('a foreign-currency amount edit uses the entity currency', () => {
  const changes = createAuditEventPayload({
    entityType: 'budget',
    action: AuditAction.UPDATE,
    changes: {
      before: { amount: 100, currencyCode: 'INR' },
      after: { amount: 200, currencyCode: 'INR' },
    },
  });
  const format = jest.spyOn(CurrencyFormatter, 'format');
  render(<AuditLogChangesView changes={changes} accountMap={{}} workplaceCurrency="USD" />);
  expect(format).toHaveBeenCalledWith(200, 'INR');
  format.mockRestore();
});

test('unchanged currency supplies display context without becoming an undo field', () => {
  const changes = createAuditEventPayload({
    entityType: 'budget',
    action: AuditAction.UPDATE,
    changes: { before: { amount: 100, currencyCode: 'INR' }, after: { amount: 200 } },
  });
  expect(getAuditEventFieldDeltas(changes)).toEqual({ amount: { before: 100, after: 200 } });
  expect(getAuditFieldDiff(changes)).toEqual({
    before: { amount: 100, currencyCode: 'INR' },
    after: { amount: 200, currencyCode: 'INR' },
  });
});

test('currency context alone does not produce a change detail', () => {
  const changes = createAuditEventPayload({
    entityType: 'budget',
    action: AuditAction.UPDATE,
    changes: { before: { amount: 100, currencyCode: 'INR' }, after: { amount: 100 } },
  });
  expect(getAuditFieldDiff(changes)).toBeNull();
  expect(changes.undoable).toBe(false);
});
