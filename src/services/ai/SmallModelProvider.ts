import { logger } from '@/src/utils/logger';
import { Platform } from 'react-native';
import {
  checkBackendSupport,
  createLLM,
  type Backend,
  type LiteRTLMInstance,
} from 'react-native-litert-lm';
import type { AIGenerateOptions, AIProvider, AIProviderInitOptions, InferenceStats } from './types';

export class SmallModelProvider implements AIProvider {
  private llm: LiteRTLMInstance | null = null;

  private executionQueue: Promise<any> = Promise.resolve();
  private lastStats: InferenceStats | null = null;

  async initialize(modelPath: string, options?: AIProviderInitOptions): Promise<void> {
    // Initialization also needs to be part of the queue to avoid clashing with late generations
    return (this.executionQueue = this.executionQueue.then(async () => {
      // Strip file:// for both platforms to ensure C++ FFI gets a clean absolute UNIX path
      const normalizedPath = modelPath.replace(/^file:\/\//, '');

      // Determine optimal backend: prefer GPU on iOS (Metal always available),
      // fall back to CPU if backend is unsupported on this device
      const requestedBackend: Backend = options?.backend ?? (Platform.OS === 'ios' ? 'gpu' : 'cpu');
      const backendWarning = checkBackendSupport(requestedBackend);
      const backend: Backend = backendWarning ? 'cpu' : requestedBackend;

      if (backendWarning) {
        logger.warn(
          `[SmallModelProvider] Backend '${requestedBackend}' unsupported: ${backendWarning}. Falling back to CPU.`,
        );
      }

      logger.info(
        `[SmallModelProvider] Initializing model at ${normalizedPath} (backend: ${backend})`,
      );

      try {
        // IMPORTANT: Reuse the same native instance across re-initializations.
        // Each HybridLiteRTLM creates its own serial DispatchQueue ("dev.litert.engine").
        // If we close() the old instance and createLLM() a new one, the old engine teardown
        // and new engine creation run on DIFFERENT queues, causing a race condition where
        // litert_lm_engine_delete and litert_lm_engine_create overlap and corrupt shared
        // global state in the LiteRT C library (SIGSEGV in ReplaceMagicNumbersIfAny).
        //
        // The native loadModel() already calls closeInternal() at the start of its async block,
        // which properly tears down the old engine + conversation on the SAME serial queue
        // before creating the new one — eliminating the race.
        if (!this.llm) {
          this.llm = createLLM({ enableMemoryTracking: true });
        }

        await this.llm.loadModel(normalizedPath, {
          backend,
          maxTokens: options?.maxTokens ?? 1024,
          systemPrompt: options?.systemPrompt,
          temperature: options?.temperature ?? 0.7,
          topK: options?.topK ?? 40,
          topP: options?.topP ?? 0.95,
        });
        this.lastStats = null;
        logger.info(`[SmallModelProvider] Model initialized`);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logger.error(`[SmallModelProvider] loadModel failed: ${errorMsg}`, e);
        throw e;
      }
    }));
  }

  async generate(prompt: string, options?: AIGenerateOptions): Promise<string> {
    // Chain onto the execution queue to ensure serial access to the native context
    const nextInQueue = this.executionQueue.then(() => this.generateInternal(prompt, options));
    this.executionQueue = nextInQueue.catch(() => {}); // Continue queue even if one fails
    return nextInQueue;
  }

  async generateStream(
    prompt: string,
    onToken: (token: string, done: boolean) => void,
    options?: AIGenerateOptions,
  ): Promise<void> {
    const nextInQueue = this.executionQueue.then(() =>
      this.generateStreamInternal(prompt, onToken, options),
    );
    this.executionQueue = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  getStats(): InferenceStats | null {
    return this.lastStats;
  }

  private async generateInternal(
    prompt: string,
    options?: AIGenerateOptions,
    retryCount = 0,
  ): Promise<string> {
    if (!this.llm) throw new Error('Provider not initialized');

    // For isolated prompts (default), reset context to avoid prior conversation
    // bleeding into JSON parsing results. The multi-pass pipeline runs 3 sequential
    // generate() calls — without reset, Pass 2 sees Pass 1's response in context.
    if (options?.resetContext !== false) {
      this.llm.resetConversation();
    }

    logger.info('[SmallModelProvider] Generating completion...');

    try {
      // Prepend instructions to avoid breaking Gemma's native chat template
      // and explicitly instruct reasoning models to skip thought traces
      const formattedPrompt = `Output valid JSON only. No explanations. Do not use <think> tags.\n\n${prompt}`;

      let result = await this.llm.sendMessage(formattedPrompt);

      logger.info('[SmallModelProvider] Raw response received:', { text: result });

      // Some distillation models (like DeepSeek R1) omit the opening <think> tag
      // and only output the reasoning followed by </think>.
      if (result.includes('</think>')) {
        result = result.substring(result.indexOf('</think>') + 8);
      }
      // Also strip any standard enclosed <think>...</think> blocks just in case
      result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      // Capture inference stats for diagnostics and benchmarking
      this.captureStats();

      return result;
    } catch (e) {
      const errorMsg = String(e);
      if (errorMsg.includes('busy') && retryCount < 3) {
        const backoff = (retryCount + 1) * 300;
        logger.warn(`[SmallModelProvider] Native busy, retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        return this.generateInternal(prompt, options, retryCount + 1);
      }

      throw e;
    }
  }

  private async generateStreamInternal(
    prompt: string,
    onToken: (token: string, done: boolean) => void,
    options?: AIGenerateOptions,
  ): Promise<void> {
    if (!this.llm) throw new Error('Provider not initialized');

    if (options?.resetContext !== false) {
      this.llm.resetConversation();
    }

    return new Promise<void>((resolve, reject) => {
      try {
        this.llm!.sendMessageAsync(prompt, (token: string, done: boolean) => {
          onToken(token, done);
          if (done) {
            this.captureStats();
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  private captureStats(): void {
    if (!this.llm) return;
    try {
      const stats = this.llm.getStats();
      this.lastStats = {
        tokensPerSecond: stats.tokensPerSecond,
        timeToFirstTokenMs: stats.timeToFirstToken,
        completionTokens: stats.completionTokens,
        totalDurationMs:
          stats.tokensPerSecond > 0 ? (stats.completionTokens / stats.tokensPerSecond) * 1000 : 0,
      };
    } catch {
      // Stats may not be available on all platforms/configurations
    }
  }

  private async disposeInternal(): Promise<void> {
    if (this.llm) {
      logger.info('[SmallModelProvider] Disposing LLM context');
      try {
        this.llm.close();
      } catch {}
      this.llm = null;
      this.lastStats = null;
    }
  }

  async dispose(): Promise<void> {
    this.executionQueue = this.executionQueue.then(() => this.disposeInternal());
    return this.executionQueue;
  }
}

export const smallModelProvider = new SmallModelProvider();
