import { logger } from '@/src/utils/logger';
import {
  AIContext,
  ParserOutput,
  TransactionFallbackAIProvider,
  TypeSafeCandidate,
} from './types/ai-parsing';

const TYPESAFE_BACKEND_URL =
  process.env.EXPO_PUBLIC_TYPESAFE_PROXY_URL?.trim() || 'http://127.0.0.1:8787';
const TYPESAFE_REQUEST_TIMEOUT_MS = 18_000;
const NONE = '__none__';
const TRANSACTION_TYPES = ['expense', 'income', 'transfer', 'unknown'] as const;
const SEMANTIC_TAGS = ['none', 'refund', 'cashback', 'chargeback', 'reversal'] as const;

function getBackendEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return base.endsWith('/typesafe/transaction') ? base : `${base}/typesafe/transaction`;
}

type TypeSafeAnswer<TChoice extends string> = {
  choice: TChoice;
  confidence: number;
};

type TypeSafeResponse = {
  answers: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readChoiceAnswer<const TChoices extends readonly string[]>(
  response: TypeSafeResponse,
  questionId: string,
  allowedChoices: TChoices,
): TypeSafeAnswer<TChoices[number]> {
  const answer = response.answers[questionId];
  if (!isRecord(answer) || answer.type !== 'choice') {
    throw new Error(`TypeSafe returned no Choice answer for ${questionId}`);
  }

  const choice = allowedChoices.find(option => option === answer.choice);
  const confidence = answer.confidence;
  if (choice === undefined || typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw new Error(`TypeSafe returned an invalid Choice answer for ${questionId}`);
  }

  return { choice, confidence };
}

export class TypeSafeTransactionFallbackAIProvider implements TransactionFallbackAIProvider {
  constructor(
    private readonly backendUrlReader: () => string = () => TYPESAFE_BACKEND_URL,
    private readonly request: typeof fetch = (...args) => fetch(...args),
  ) {}

  get isConfigured(): boolean {
    return this.backendUrlReader().length > 0;
  }

  async parse(transcript: string, context: AIContext): Promise<ParserOutput | null> {
    const backendUrl = this.backendUrlReader();
    if (!backendUrl) return null;

    const endpoint = getBackendEndpoint(backendUrl);
    const transport = 'backend';
    const sourceAccounts = uniqueCandidates(context.accounts);
    const categories = uniqueCandidates(context.categories);

    // The backend adds the no-match sentinel and enforces TypeSafe's Choice limit.
    if (
      sourceAccounts.length === 0 ||
      categories.length === 0 ||
      sourceAccounts.length >= 255 ||
      categories.length >= 255
    ) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TYPESAFE_REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();
    const requestBody = {
      transcript,
      parserHints: context.parserHints,
      sourceAccounts,
      categories,
    };

    logger.debug('[TypeSafe] Request payload', {
      endpoint,
      transport,
      body: requestBody,
    });

    try {
      const response = await this.request(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const payload = (await response.json()) as unknown;
      logger.debug('[TypeSafe] Response payload', {
        endpoint,
        transport,
        status: response.status,
        ok: response.ok,
        duration_ms: Date.now() - startedAt,
        body: payload,
      });

      if (!response.ok) throw new Error(`TypeSafe backend returned HTTP ${response.status}`);

      if (!isRecord(payload) || !isRecord(payload.answers)) {
        throw new Error('TypeSafe backend returned an invalid response');
      }

      const typedResponse = payload as TypeSafeResponse;
      const typeAnswer = readChoiceAnswer(typedResponse, 'transaction_type', TRANSACTION_TYPES);
      const sourceAnswer = readChoiceAnswer(typedResponse, 'source_account', [
        ...sourceAccounts.map(candidate => candidate.id),
        NONE,
      ] as const);
      const categoryAnswer = readChoiceAnswer(typedResponse, 'category', [
        ...categories.map(candidate => candidate.id),
        NONE,
      ] as const);
      const semanticAnswer = readChoiceAnswer(typedResponse, 'semantic_tag', SEMANTIC_TAGS);

      // No-match is an explicit, safe escape hatch. Let the deterministic pipeline resolve it.
      if (
        typeAnswer.choice === 'unknown' ||
        sourceAnswer.choice === NONE ||
        categoryAnswer.choice === NONE
      ) {
        return null;
      }

      const sourceAccount = sourceAccounts.find(candidate => candidate.id === sourceAnswer.choice);
      const category = categories.find(candidate => candidate.id === categoryAnswer.choice);
      if (!sourceAccount || !category) return null;

      const confidenceScore = Math.min(
        typeAnswer.confidence,
        sourceAnswer.confidence,
        categoryAnswer.confidence,
        semanticAnswer.confidence,
      );

      return {
        transactions: [
          {
            type: typeAnswer.choice,
            amount: context.parserHints.amount,
            accountId: sourceAccount.id,
            categoryId: category.id,
            accountNameHint: sourceAccount.name,
            categoryNameHint: category.name,
            description: context.parserHints.rawItem || transcript,
            isReversal: ['refund', 'chargeback', 'reversal'].includes(semanticAnswer.choice),
            semanticTag: semanticAnswer.choice === 'none' ? undefined : semanticAnswer.choice,
          },
        ],
        confidenceScore,
        // Keep the confirmation UI in the loop until this app calibrates a threshold against real examples.
        isHighConfidence: false,
        provider: 'typesafe',
      };
    } catch (error) {
      logger.debug('[TypeSafe] Request failed', {
        endpoint,
        transport,
        duration_ms: Date.now() - startedAt,
        error:
          error instanceof Error ? { name: error.name, message: error.message } : String(error),
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function uniqueCandidates(candidates: TypeSafeCandidate[]): TypeSafeCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (!candidate.id || !candidate.name || seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

export const typeSafeAIProvider = new TypeSafeTransactionFallbackAIProvider();
