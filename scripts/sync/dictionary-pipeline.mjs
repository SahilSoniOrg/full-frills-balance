import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const dictionaryDir = resolve(root, 'src/services/sync/dictionaries');
export const mapFile = resolve(root, 'src/services/sync/shortKeys/schema35.json');
export const recipeFile = resolve(dictionaryDir, 'recipe.json');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const pretty = object => `${JSON.stringify(object, null, 2)}\n`;

export async function inputs() {
  const [mapBytes, recipeBytes] = await Promise.all([readFile(mapFile), readFile(recipeFile)]);
  const maps = JSON.parse(mapBytes);
  const recipe = JSON.parse(recipeBytes);
  if (
    recipe.formatVersion !== 1 ||
    recipe.schemaVersion !== 35 ||
    recipe.dictionaryVersion !== 1 ||
    recipe.dictionaryBytes !== 16384 ||
    recipe.zstdVersion !== '1.5.7' ||
    recipe.samplesPerTable !== 4096 ||
    recipe.seed !== 1179001394 ||
    recipe.zstdDictionaryIdBase !== 35001000 ||
    recipe.trainer !== '--train-fastcover=k=50,d=8,f=20,steps=4,split=100,accel=1'
  )
    throw new Error('Unreviewed dictionary recipe; create a new dictionary version for changes');
  const tables = Object.keys(maps).sort();
  if (tables.length !== 12) throw new Error('Expected twelve logical tables');
  return { maps, recipe, tables, mapSha256: sha256(mapBytes), recipeSha256: sha256(recipeBytes) };
}
export async function sourceHashes() {
  const files = ['dictionary-pipeline.mjs', 'generate-corpus.mjs', 'train-dictionaries.mjs'];
  return Object.fromEntries(
    await Promise.all(
      files.map(async name => [name, sha256(await readFile(resolve(root, 'scripts/sync', name)))]),
    ),
  );
}
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const numbers = new Set(
  'orderNum reconciledAt archivedAt createdAt updatedAt deletedAt journalDate totalAmount transactionCount amount transactionDate exchangeRate timestamp intervalN startDate recurrenceDay recurrenceMonth statementDay dueDay minimumPaymentAmount minimumBalanceAmount creditLimitAmount aprBps emiDay loanTenureMonths gracePeriodDays minimumPaymentPercent destinationAmount endDate nextOccurrence priority inputDate parsedAmount duplicateConfidence parseConfidence firstSeenAt lastScannedAt processedAt safeToSpendDays'.split(
    ' ',
  ),
);
const booleans = new Set('active autopayEnabled minPaymentOnly isAutoPost isActive'.split(' '));
const texts = [
  ['SYNTHETIC Corner Tea', 'Synthetic lunch and groceries', 'INR'],
  ['काल्पनिक चाय दुकान', 'यह केवल कृत्रिम भुगतान का उदाहरण है', 'INR'],
  ['SYNTHETIC chai dukaan', 'Aaj ka synthetic kirana kharcha', 'INR'],
  ['கற்பனை கடை', 'செயற்கை செலவு மாதிரி', 'USD'],
  ['متجر تجريبي', 'دفعة اصطناعية للاختبار فقط', 'EUR'],
  ['架空の喫茶店', '合成データの支払い例', 'JPY'],
];
/** No input-data argument, DB access, locale, wall clock or ambient randomness. */
export function corpusRows(table, map, recipe, count = recipe.samplesPerTable) {
  const tableSeed = parseInt(sha256(Buffer.from(table)).slice(0, 8), 16);
  const random = seeded(recipe.seed ^ tableSeed);
  return Array.from({ length: count }, (_, index) => {
    const [payee, note, currency] = texts[index % texts.length];
    const amount = Math.round((1 + random() * 100000) * 100) / 100;
    const date = 1704067200000 + index * 86400000;
    const ref = `SYN-${table}-${index.toString().padStart(6, '0')}`;
    const body = Object.fromEntries(
      Object.keys(map).map(field => {
        let value = `${payee} ${field} ${index % 29}`;
        if (numbers.has(field))
          value = /Date$|At$|Occurrence$|timestamp/.test(field)
            ? date
            : Math.floor(random() * 28) + 1;
        if (booleans.has(field)) value = index % 3 !== 0;
        if (/Id$/.test(field)) value = `synthetic-${field}-${index % 97}`;
        if (field === 'name' || field === 'parsedMerchant') value = payee;
        if (field === 'notes' || field === 'description') value = `${note} ${ref}`;
        if (
          field === 'currencyCode' ||
          field === 'parsedCurrencyCode' ||
          field === 'defaultCurrencyCode'
        )
          value = currency;
        if (field === 'currencyPrecisions') value = { EUR: 2, INR: 2, JPY: 0, USD: 2 };
        if (field === 'safeToSpendDays') value = [30, 60, 90][index % 3];
        if (/Amount$|^amount$/.test(field)) value = amount;
        if (field === 'transactionCount') value = 2;
        if (field === 'exchangeRate') value = 1;
        if (field === 'intervalN') value = 1;
        if (field === 'intervalType') value = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'][index % 4];
        if (field === 'startMonth')
          value = `2024-${((index % 12) + 1).toString().padStart(2, '0')}`;
        if (field === 'accountType')
          value = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'][index % 5];
        if (field === 'transactionType') value = index % 2 ? 'DEBIT' : 'CREDIT';
        if (field === 'status') value = table === 'journals' ? 'POSTED' : 'ACTIVE';
        if (field === 'displayType') value = ['INCOME', 'EXPENSE', 'TRANSFER', 'MIXED'][index % 4];
        if (field === 'fxMode') value = ['automatic', 'fixed', 'manual'][index % 3];
        if (field === 'entityType') value = 'journal';
        if (field === 'action') value = ['CREATE', 'UPDATE', 'DELETE'][index % 3];
        if (field === 'channel') value = 'sms';
        if (field === 'importSource') value = 'synthetic';
        if (field === 'referenceNumber') value = ref;
        if (field === 'inputFingerprint') value = `sha256:${sha256(Buffer.from(ref))}`;
        if (field === 'parseStatus') value = 'parsed';
        if (field === 'processingStatus')
          value = ['imported', 'auto_posted', 'dismissed'][index % 3];
        if (field === 'direction') value = ['debit', 'credit', 'unknown'][index % 3];
        if (field === 'parseConfidence' || field === 'duplicateConfidence')
          value = Math.round(random() * 100) / 100;
        if (field === 'metadataJson')
          value = JSON.stringify({ importSource: 'synthetic', referenceNumber: ref });
        if (field === 'changes')
          value = JSON.stringify({ after: { amount, description: note }, before: { amount: 0 } });
        if (field === 'channelsJson') value = '["sms"]';
        if (field === 'conditionsJson')
          value = JSON.stringify({ currencyCode: currency, direction: 'debit' });
        if (field === 'actionsJson') value = JSON.stringify({ notes: note, reference: ref });
        if (field === 'assetAccountIds') value = '["synthetic-asset-1","synthetic-asset-2"]';
        // Synthetic SMS content belongs only in an allowed rule-pattern field.
        if (field === 'bodyMatch')
          value = `SYNTHETIC SMS: ${currency} ${amount} paid to ${payee}. ${note}. Ref ${ref}`;
        if (field === 'icon') value = ['wallet', 'cash', '📚', '🏦'][index % 4];
        if (field === 'color') value = ['#112233', '#7DD3A8', '#FFAA00'][index % 3];
        return [field, value];
      }),
    );
    // No numeric-looking JSON object keys. Nested precision keys are explicitly
    // ordered above, so this JSON is identical to the production canonical form.
    const short = Object.fromEntries(
      Object.entries(body)
        .map(([field, value]) => [map[field], value])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    return { body, short };
  });
}
export function corpusBytes(rows) {
  return Buffer.from(rows.map(row => JSON.stringify(row.short)).join('\n') + '\n', 'utf8');
}
export async function readDictionaryArtifacts() {
  const lock = JSON.parse(await readFile(resolve(dictionaryDir, 'artifacts.lock.json'), 'utf8'));
  if (lock.formatVersion !== 1 || lock.zstdVersion !== '1.5.7' || !Array.isArray(lock.dictionaries))
    throw new Error('Invalid dictionary artifact lock');
  const { tables, recipe, mapSha256, recipeSha256 } = await inputs();
  const sources = await sourceHashes();
  if (
    lock.mapSha256 !== mapSha256 ||
    lock.recipeSha256 !== recipeSha256 ||
    JSON.stringify(lock.sources) !== JSON.stringify(sources)
  )
    throw new Error('Dictionary provenance differs; regenerate/check the pinned recipe');
  const ids = new Set(),
    files = new Set();
  const artifacts = [];
  for (const entry of lock.dictionaries) {
    const match = /^([a-z_]+)\/v([1-9][0-9]*)$/.exec(entry.id);
    if (
      !match ||
      !tables.includes(match[1]) ||
      entry.file !== `${match[1]}.v${match[2]}.bin` ||
      ids.has(entry.id) ||
      files.has(entry.file) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error('Invalid or duplicate dictionary descriptor');
    ids.add(entry.id);
    files.add(entry.file);
    const bytes = await readFile(resolve(dictionaryDir, entry.file));
    if (
      bytes.length < 256 ||
      bytes.length > recipe.dictionaryBytes ||
      bytes.length !== entry.bytes ||
      sha256(bytes) !== entry.sha256 ||
      bytes.readUInt32LE(0) !== 0xec30a437 ||
      bytes.readUInt32LE(4) !== entry.zstdDictionaryId
    )
      throw new Error(`Corrupt dictionary: ${entry.id}`);
    artifacts.push({ ...entry, bytes });
  }
  for (const table of tables)
    if (!ids.has(`${table}/v1`)) throw new Error(`Missing dictionary: ${table}/v1`);
  for (const file of await readdir(dictionaryDir))
    if (file.endsWith('.bin') && !files.has(file))
      throw new Error(`Unregistered dictionary: ${file}`);
  return artifacts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
