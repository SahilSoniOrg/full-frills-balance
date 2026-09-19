import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.TYPESAFE_PROXY_PORT || 8787);
const HOST = process.env.TYPESAFE_PROXY_HOST || '127.0.0.1';
const TYPESAFE_API_URL = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY?.trim() || '';
export const TYPESAFE_PROXY_ROUTE = '/typesafe/transaction';
const DEBUG_LOGS = process.env.TYPESAFE_DEBUG_LOGS === '1' || process.env.NODE_ENV !== 'production';
const MAX_BODY_BYTES = 200_000;
const MAX_TRANSCRIPT_LENGTH = 4_000;
const MAX_CANDIDATES = 254;
const MAX_CANDIDATE_ID_LENGTH = 500;
const MAX_CANDIDATE_NAME_LENGTH = 200;
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:8081',
  'http://localhost:8081',
  'http://127.0.0.1:19006',
  'http://localhost:19006',
  ...(process.env.TYPESAFE_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
]);
const NONE = '__none__';

class RequestValidationError extends Error {}

function writeJson(response, status, body, origin) {
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['access-control-allow-origin'] = origin;
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RequestValidationError('request_too_large');
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestValidationError('invalid_json');
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCandidates(value, field) {
  if (!Array.isArray(value)) throw new RequestValidationError(`${field}_must_be_an_array`);
  if (value.length === 0 || value.length > MAX_CANDIDATES) {
    throw new RequestValidationError(`${field}_count_out_of_range`);
  }

  const seen = new Set();
  const candidates = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) throw new RequestValidationError(`${field}_item_invalid`);
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    if (
      !id ||
      !name ||
      id.length > MAX_CANDIDATE_ID_LENGTH ||
      name.length > MAX_CANDIDATE_NAME_LENGTH
    ) {
      throw new RequestValidationError(`${field}_item_invalid`);
    }
    if (seen.has(id)) continue;
    seen.add(id);
    candidates.push({ id, name });
  }

  if (candidates.length === 0) throw new RequestValidationError(`${field}_empty`);
  return candidates;
}

function normalizeParserHints(value) {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new RequestValidationError('parser_hints_invalid');

  const parserHints = {};
  if (value.amount !== undefined) {
    if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount < 0) {
      throw new RequestValidationError('parser_hints_amount_invalid');
    }
    parserHints.amount = value.amount;
  }
  for (const key of ['rawAccount', 'rawItem']) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || value[key].length > MAX_TRANSCRIPT_LENGTH) {
        throw new RequestValidationError(`parser_hints_${key}_invalid`);
      }
      parserHints[key] = value[key];
    }
  }
  if (value.direction !== undefined) {
    if (!['debit', 'credit', 'unknown'].includes(value.direction)) {
      throw new RequestValidationError('parser_hints_direction_invalid');
    }
    parserHints.direction = value.direction;
  }
  return parserHints;
}

export function validateAndNormalizeAppRequest(value) {
  if (!isRecord(value)) throw new RequestValidationError('request_invalid');
  if (
    typeof value.transcript !== 'string' ||
    !value.transcript.trim() ||
    value.transcript.length > MAX_TRANSCRIPT_LENGTH
  ) {
    throw new RequestValidationError('transcript_invalid');
  }

  return {
    transcript: value.transcript.trim(),
    parserHints: normalizeParserHints(value.parserHints),
    sourceAccounts: normalizeCandidates(value.sourceAccounts, 'source_accounts'),
    categories: normalizeCandidates(value.categories, 'categories'),
  };
}

function choiceQuestion(instructions, options, descriptions) {
  return {
    type: 'choice',
    instructions,
    criteria: Object.fromEntries(options.map(option => [option, descriptions[option] ?? null])),
  };
}

function candidateCriteria(candidates) {
  return Object.fromEntries(
    candidates.map(candidate => [
      candidate.id,
      `The user's account/category named ${candidate.name}.`,
    ]),
  );
}

export function buildTypeSafeRequest(value) {
  const appRequest = validateAndNormalizeAppRequest(value);
  const transactionTypes = ['expense', 'income', 'transfer', 'unknown'];
  const semanticTags = ['none', 'refund', 'cashback', 'chargeback', 'reversal'];
  const sourceAccountIds = appRequest.sourceAccounts.map(candidate => candidate.id);
  const categoryIds = appRequest.categories.map(candidate => candidate.id);

  return {
    model: 'jev-latest',
    state: appRequest,
    questions: {
      transaction_type: choiceQuestion(
        'What kind of transaction does `transcript` describe? Use `parserHints.direction` as a hint, but follow the transcript when they conflict.',
        transactionTypes,
        {
          expense: 'Money paid out for a purchase, bill, fee, or other spending.',
          income: 'Money received as salary, income, or another inflow.',
          transfer: "Money moved between the user's own accounts.",
          unknown:
            'The transcript does not contain enough information to identify the transaction type.',
        },
      ),
      source_account: choiceQuestion(
        'Which candidate account is the account money should come from or arrive in? Choose `__none__` when no candidate is supported by the transcript.',
        [...sourceAccountIds, NONE],
        {
          ...candidateCriteria(appRequest.sourceAccounts),
          [NONE]: 'None of the supplied accounts matches.',
        },
      ),
      category: choiceQuestion(
        'Which candidate category best matches the transaction? Choose `__none__` when no candidate is supported by the transcript.',
        [...categoryIds, NONE],
        {
          ...candidateCriteria(appRequest.categories),
          [NONE]: 'None of the supplied categories matches.',
        },
      ),
      semantic_tag: choiceQuestion(
        'Does `transcript` describe a special semantic transaction tag?',
        semanticTags,
        {
          none: 'An ordinary transaction with no refund, cashback, chargeback, or reversal meaning.',
          refund: 'Money returned by a merchant or provider for a previous purchase.',
          cashback: 'A cashback reward or rebate received from a merchant, card, or provider.',
          chargeback:
            'A card or payment dispute resulting in a card or payment being reversed or returned.',
          reversal: 'A previous transaction is explicitly being reversed or cancelled.',
        },
      ),
    },
  };
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;

  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {}, origin);
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    writeJson(response, 200, { ok: true, configured: TYPESAFE_API_KEY.length > 0 }, origin);
    return;
  }

  if (request.method !== 'POST' || request.url !== TYPESAFE_PROXY_ROUTE) {
    writeJson(response, 404, { error: 'not_found' }, origin);
    return;
  }

  if (!TYPESAFE_API_KEY) {
    writeJson(response, 503, { error: 'server_not_configured' }, origin);
    return;
  }

  try {
    const appRequest = await readBody(request);
    const typeSafeRequest = buildTypeSafeRequest(appRequest);
    if (DEBUG_LOGS) {
      console.log('[TypeSafe proxy] App request payload', JSON.stringify(appRequest));
      console.log('[TypeSafe proxy] TypeSafe request payload', JSON.stringify(typeSafeRequest));
    }

    const upstream = await fetch(TYPESAFE_API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TYPESAFE_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(typeSafeRequest),
    });
    const text = await upstream.text();
    let upstreamBody;
    try {
      upstreamBody = JSON.parse(text);
    } catch {
      upstreamBody = { raw: text };
    }

    if (DEBUG_LOGS) {
      console.log(
        '[TypeSafe proxy] Response payload',
        JSON.stringify({ status: upstream.status, body: upstreamBody }),
      );
    } else {
      console.log('[TypeSafe proxy] Request completed', upstream.status);
    }
    writeJson(response, upstream.status, upstreamBody, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RequestValidationError ? 400 : 502;
    console.warn('[TypeSafe proxy] Request failed', message);
    writeJson(response, status, { error: message }, origin);
  }
});

function startServer() {
  if (!TYPESAFE_API_KEY) {
    console.error('TYPESAFE_API_KEY is required. Set it only in the backend environment.');
    process.exitCode = 1;
    return;
  }

  server.listen(PORT, HOST, () => {
    console.log(`TypeSafe backend listening on http://${HOST}:${PORT}`);
    console.log('The TypeSafe API key is server-side and is never printed or returned.');
  });
}

const isMain = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (isMain) startServer();
