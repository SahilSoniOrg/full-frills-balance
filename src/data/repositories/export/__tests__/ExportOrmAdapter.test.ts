import Model from '@nozbe/watermelondb/Model';
import { projectOrmRow } from '../ExportOrmAdapter';

describe('projectOrmRow', () => {
  it('maps schema columns from Watermelon raw storage to camelCase export keys', () => {
    const row = {
      _raw: {
        id: 'account-1',
        workplace_id: 'workplace-1',
        currency_code: 'USD',
      },
    } as unknown as Model;

    expect(projectOrmRow(row, ['id', 'workplace_id', 'currency_code'])).toEqual({
      id: 'account-1',
      workplaceId: 'workplace-1',
      currencyCode: 'USD',
    });
  });

  it('uses camelCase model values when raw storage is unavailable', () => {
    const row = {
      id: 'account-1',
      workplaceId: 'workplace-1',
    } as unknown as Model;

    expect(projectOrmRow(row, ['id', 'workplace_id'])).toEqual({
      id: 'account-1',
      workplaceId: 'workplace-1',
    });
  });
});
