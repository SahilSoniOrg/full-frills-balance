import { buildPersonShareSummary } from '@/src/domain/people/personShareSummary';
import type {
  OpenItem,
  PersonCurrencyBalance,
  SettlementAllocation,
} from '@/src/domain/people/personTypes';
import type { WorkplaceId } from '@/src/types/ids';
import { ShareFormat, type Shareable } from '@/src/types/sharing';
import { throwIfShareAborted } from './sharingCancellation';

export function createPeopleShareable(input: {
  workplaceId: WorkplaceId;
  recipientName: string;
  date: string;
  items: readonly OpenItem[];
  allocations: readonly SettlementAllocation[];
  balances?: readonly PersonCurrencyBalance[];
  includeDate?: boolean;
  includeOpenItems?: boolean;
  includeRepayments?: boolean;
  includeBalances?: boolean;
}): Shareable {
  return {
    id: `person-summary-${input.workplaceId}`,
    title: `Summary for ${input.recipientName}`,
    filename: 'person-summary',
    mimeType: 'text/plain',
    fileExtension: 'txt',
    supportedFormats: [ShareFormat.TEXT],
    scope: { kind: 'workplace', workplaceId: input.workplaceId },
    requireFile: false,
    async prepare(_format, context) {
      throwIfShareAborted(context.signal);
      const content = buildPersonShareSummary(input);
      return { kind: 'text', content };
    },
  };
}
