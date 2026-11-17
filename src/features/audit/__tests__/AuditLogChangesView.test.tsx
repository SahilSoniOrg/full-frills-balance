import './auditUiTestMocks';
import { render } from '@testing-library/react-native';
import { PrivacyScopeProvider } from '@/src/contexts/PrivacyScope';
import { AuditLogChangesView } from '@/src/features/audit/components/AuditLogChangesView';
import { createAuditEventPayload } from '@/src/domain/audit/auditEvents';
import { AuditAction } from '@/src/types/enums';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';

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
  render(
    <PrivacyScopeProvider>
      <AuditLogChangesView changes={changes} accountMap={{}} workplaceCurrency="USD" />
    </PrivacyScopeProvider>,
  );
  expect(format).toHaveBeenCalledWith(200, 'INR');
  format.mockRestore();
});
