import { createPeopleShareable } from '../peopleShareAdapter';
import { ShareFormat } from '@/src/types/sharing';
import { asWorkplaceId } from '@/src/types/ids';

describe('createPeopleShareable', () => {
  const input = {
    workplaceId: asWorkplaceId('wp'),
    recipientName: 'Alex',
    date: '2026-11-26',
    items: [],
    allocations: [],
  };
  it('prepares the plain text summary', async () => {
    const shareable = createPeopleShareable(input);
    const artifact = await shareable.prepare(ShareFormat.TEXT, {
      signal: new AbortController().signal,
      reportProgress: jest.fn(),
    });
    expect(artifact).toEqual({
      kind: 'text',
      content: 'Summary for Alex\nDate: 2026-11-26\nOpen items:\nRemaining balances:',
    });
  });
  it('honors cancellation before formatting', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createPeopleShareable(input).prepare(ShareFormat.TEXT, {
        signal: controller.signal,
        reportProgress: jest.fn(),
      }),
    ).rejects.toThrow();
  });
});
