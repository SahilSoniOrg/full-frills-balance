import { logger } from '@/src/utils/logger';
import { File } from 'expo-file-system';
import * as llamaModule from 'llama.rn';
import { Platform } from 'react-native';
import { AIProvider } from './types';

// We dynamically import llama.rn to avoid issues on platforms where it's not supported
// or during build time if native modules are not linked.
let initLlama: any;
try {
  initLlama = llamaModule?.initLlama;
  if (initLlama) {
    logger.info('[SmallModelProvider] llama.rn module loaded successfully');
  } else {
    logger.warn('[SmallModelProvider] llama.rn module loaded but initLlama is missing');
  }
} catch (_e) {
  // Silent at top level, error will be thrown during initialize() if used
}

export class SmallModelProvider implements AIProvider {
  private context: any = null;
  private executionQueue: Promise<any> = Promise.resolve();

  async initialize(modelPath: string): Promise<void> {
    // Initialization also needs to be part of the queue to avoid clashing with late generations
    return (this.executionQueue = this.executionQueue.then(async () => {
      if (!initLlama) {
        throw new Error(
          'llama.rn is not available on this platform/build. Did you rebuild the native app?',
        );
      }

      if (this.context) {
        await this.disposeInternal();
      }

      const normalizedPath =
        Platform.OS === 'android' ? modelPath.replace('file://', '') : modelPath;

      try {
        const file = new File(modelPath);
        if (!file.exists) throw new Error(`Model file not found at path: ${modelPath}`);
      } catch (fileErr) {
        logger.error(`[SmallModelProvider] File verification failed: ${modelPath}`, fileErr);
        throw fileErr;
      }

      logger.info(`[SmallModelProvider] Initializing model at ${normalizedPath}`);

      try {
        this.context = await initLlama({
          model: normalizedPath,
          n_ctx: 2048,
          n_threads: Platform.OS === 'android' ? 6 : 4,
          n_gpu_layers: Platform.OS === 'ios' ? 1 : 0,
        });
        logger.info(
          `[SmallModelProvider] Model initialized with ${Platform.OS === 'android' ? 6 : 4} threads`,
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logger.error(`[SmallModelProvider] initLlama failed: ${errorMsg}`, e);
        throw e;
      }
    }));
  }

  async generate(prompt: string, options?: { timeout?: number }): Promise<string> {
    // Chain onto the execution queue to ensure serial access to the native context
    const nextInQueue = this.executionQueue.then(() => this.generateInternal(prompt, options));
    this.executionQueue = nextInQueue.catch(() => {}); // Continue queue even if one fails
    return nextInQueue;
  }

  private async generateInternal(
    prompt: string,
    options?: { timeout?: number },
    retryCount = 0,
  ): Promise<string> {
    if (!this.context) throw new Error('Provider not initialized');

    const timeout = options?.timeout || 10000;

    logger.info('[SmallModelProvider] Generating completion...');

    // 1. The native completion call
    const completionPromise = this.context.completion({
      messages: [
        { role: 'system', content: 'Output valid JSON only. No explanations.' },
        { role: 'user', content: prompt },
      ],
      n_predict: 128,
      sampling: { temp: 0.1 },
    });

    // 2. The JS timeout monitor
    let timeoutId: any;
    const timeoutPromise = new Promise<string>(resolve => {
      timeoutId = setTimeout(() => resolve('ERROR_AI_TIMEOUT'), timeout);
    });

    try {
      const result: any = await Promise.race([completionPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      if (result === 'ERROR_AI_TIMEOUT') {
        logger.warn('[SmallModelProvider] Generation timed out, stopping native task');
        try {
          await this.context.stopCompletion();
        } catch {}
        throw new Error('AI_TIMEOUT');
      }

      logger.info('[SmallModelProvider] Raw response received:', { text: result.text });
      return result.text;
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);

      const errorMsg = String(e);
      if (errorMsg.includes('Context is busy') && retryCount < 3) {
        const backoff = (retryCount + 1) * 300;
        logger.warn(`[SmallModelProvider] Native busy, retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        return this.generateInternal(prompt, options, retryCount + 1);
      }

      try {
        await this.context.stopCompletion();
      } catch {}
      throw e;
    }
  }

  private async disposeInternal(): Promise<void> {
    if (this.context) {
      logger.info('[SmallModelProvider] Disposing context');
      try {
        await this.context.stopCompletion();
      } catch {}
      if (typeof this.context.release === 'function') {
        await this.context.release();
      }
      this.context = null;
    }
  }

  async dispose(): Promise<void> {
    this.executionQueue = this.executionQueue.then(() => this.disposeInternal());
    return this.executionQueue;
  }
}

export const smallModelProvider = new SmallModelProvider();
