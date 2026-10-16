import test from 'node:test';
import assert from 'node:assert/strict';
import { inputs, corpusRows, corpusBytes } from '../dictionary-pipeline.mjs';
import { embedDictionaries, INTENDED_LOOKUP_INTERFACE } from '../embed-dictionaries.mjs';

test('seeded multilingual corpus is independent per table and stable for prefixes', async () => {
  const { tables, maps, recipe } = await inputs();
  assert.equal(tables.length, 12);
  for (const table of tables) {
    const rows = corpusRows(table, maps[table], recipe, 12);
    assert.deepEqual(corpusBytes(rows), corpusBytes(corpusRows(table, maps[table], recipe, 12)));
    assert.deepEqual(rows.slice(0, 6), corpusRows(table, maps[table], recipe, 6));
    assert.deepEqual(Object.keys(rows[0].short).sort(), Object.values(maps[table]).sort());
    for (const row of rows) {
      for (const forbidden of [
        'rawBody',
        'originalSmsBody',
        'senderAddress',
        'originalSmsSender',
        'workplaceId',
        'id',
      ])
        assert.equal(Object.hasOwn(row.body, forbidden), false);
    }
  }
  const rows = corpusRows('transactions', maps.transactions, recipe, 12);
  assert.match(JSON.stringify(rows), /कृत्रिम/);
  assert.match(JSON.stringify(rows), /synthetic kirana/);
  assert.match(JSON.stringify(rows), /செயற்கை/);
  assert.notDeepEqual(
    rows,
    corpusRows('transactions', maps.transactions, { ...recipe, seed: recipe.seed + 1 }, 12),
  );
});
test('synthetic SMS text exists only in an allowed rule pattern and metadata remains source-free', async () => {
  const { maps, recipe } = await inputs();
  const [rule] = corpusRows(
    'transaction_auto_post_rules',
    maps.transaction_auto_post_rules,
    recipe,
    1,
  );
  assert.match(rule.body.bodyMatch, /SYNTHETIC SMS:/);
  const [inbox] = corpusRows(
    'transaction_inbox_records',
    maps.transaction_inbox_records,
    recipe,
    1,
  );
  assert.match(inbox.body.inputFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(JSON.parse(inbox.body.metadataJson)).sort(), [
    'importSource',
    'referenceNumber',
  ]);
});
test('native embedding matches the checked-in dictionary artifacts', async () => {
  await embedDictionaries({ check: true });
  assert.equal(
    INTENDED_LOOKUP_INTERFACE,
    'lookupRowDictionary(std::string_view)->std::span<const std::uint8_t>',
  );
});
