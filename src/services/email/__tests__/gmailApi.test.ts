import { fromByteArray } from 'base64-js';
import { readGmailMessage, readGmailPreview, readGmailRawMessage } from '../gmailApi';

const originalFetch = global.fetch;

function encodeBody(text: string): string {
  return fromByteArray(new TextEncoder().encode(text))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function mockJson(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}

afterEach(() => {
  global.fetch = originalFetch;
});

it('reads an HTML-only inbox message larger than the old 128KB cutoff', async () => {
  const html = `<html><body><p>${'Bill amount INR 999.'.repeat(20)}</p></body></html>`;
  global.fetch = jest.fn().mockResolvedValueOnce(
    mockJson({
      id: 'html-only',
      sizeEstimate: 1_500_000,
      labelIds: ['INBOX'],
      internalDate: String(Date.UTC(2026, 10, 9, 0, 35)),
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'billing@bsnl.example' },
          { name: 'Subject', value: 'Telephone bill' },
        ],
        parts: [
          {
            mimeType: 'text/html',
            body: { data: encodeBody(html), size: html.length },
          },
          {
            mimeType: 'application/pdf',
            filename: 'bill.pdf',
            body: { attachmentId: 'pdf', size: 1_400_000 },
          },
        ],
      },
    }),
  );

  const read = await readGmailMessage('token', 'html-only');

  expect(read).toMatchObject({
    status: 'ok',
    message: {
      id: 'html-only',
      sender: 'billing@bsnl.example',
      subject: 'Telephone bill',
      primaryPlainText: false,
      sizeEstimate: 1_500_000,
    },
  });
  expect(read.status === 'ok' && read.message.text).toContain('Bill amount INR 999.');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it('marks HTML-less messages as retryable instead of durable skips', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      mockJson({
        id: 'empty-body',
        sizeEstimate: 2048,
        labelIds: ['INBOX'],
        internalDate: String(Date.UTC(2026, 10, 9, 0, 35)),
        payload: {
          mimeType: 'multipart/mixed',
          headers: [{ name: 'From', value: 'billing@bsnl.example' }],
          parts: [
            {
              mimeType: 'application/pdf',
              filename: 'bill.pdf',
              body: { attachmentId: 'pdf', size: 2048 },
            },
          ],
        },
      }),
    )
    .mockResolvedValueOnce(mockJson({ id: 'empty-body', raw: undefined }));

  await expect(readGmailMessage('token', 'empty-body')).resolves.toEqual({
    status: 'retry',
    reason: 'no_supported_plain_text',
  });
});

it('fetches the complete raw message without a sizeEstimate gate', async () => {
  const rawBytes = new TextEncoder().encode('From: a@b\r\n\r\nlarge body');
  const raw = fromByteArray(rawBytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  global.fetch = jest.fn().mockResolvedValueOnce(
    mockJson({
      id: 'raw-1',
      raw,
      sizeEstimate: 1_500_000,
    }),
  );

  const bytes = await readGmailRawMessage('token', 'raw-1');

  expect(bytes).toEqual(rawBytes);
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('format=raw');
});

it('previews HTML from format=full before requesting raw', async () => {
  const html = '<p>Preview body</p>';
  global.fetch = jest.fn().mockResolvedValueOnce(
    mockJson({
      id: 'preview-1',
      sizeEstimate: 1_500_000,
      payload: {
        mimeType: 'text/html',
        body: { data: encodeBody(html), size: html.length },
      },
    }),
  );

  const preview = await readGmailPreview('token', 'preview-1');

  expect(preview).toEqual({ kind: 'html', content: html });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
