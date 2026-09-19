import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTypeSafeRequest,
  TYPESAFE_PROXY_ROUTE,
  validateAndNormalizeAppRequest,
} from '../typesafe-proxy.mjs';

const appRequest = {
  transcript: '120 rupees for tea from Bank',
  parserHints: { amount: 120, rawItem: 'tea', direction: 'debit' },
  sourceAccounts: [{ id: 'bank-id', name: 'Bank' }],
  categories: [{ id: 'food-id', name: 'Food & Drink' }],
};

test('builds the TypeSafe request from the app contract', () => {
  const request = buildTypeSafeRequest(appRequest);

  assert.equal(TYPESAFE_PROXY_ROUTE, '/typesafe/transaction');
  assert.deepEqual(request.state, appRequest);
  assert.equal(request.model, 'jev-latest');
  assert.deepEqual(request.questions.source_account.criteria, {
    'bank-id': "The user's account/category named Bank.",
    __none__: 'None of the supplied accounts matches.',
  });
  assert.deepEqual(request.questions.category.criteria, {
    'food-id': "The user's account/category named Food & Drink.",
    __none__: 'None of the supplied categories matches.',
  });
});

test('normalizes candidates and rejects malformed input', () => {
  const normalized = validateAndNormalizeAppRequest({
    ...appRequest,
    transcript: '  120 rupees for tea from Bank  ',
    sourceAccounts: [
      { id: 'bank-id', name: ' Bank ' },
      { id: 'bank-id', name: 'Duplicate' },
    ],
  });

  assert.equal(normalized.transcript, '120 rupees for tea from Bank');
  assert.deepEqual(normalized.sourceAccounts, [{ id: 'bank-id', name: 'Bank' }]);
  assert.throws(
    () => buildTypeSafeRequest({ ...appRequest, transcript: '' }),
    /transcript_invalid/,
  );
  assert.throws(
    () => buildTypeSafeRequest({ ...appRequest, categories: [] }),
    /categories_count_out_of_range/,
  );
});
