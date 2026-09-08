import { Registry } from './registry.js';
import {
  GenerationRequest,
  GenerationResult,
  NoProviderAvailableError,
} from './types.js';
import type { Modality } from './types.js';

export const LOCAL_LABEL = 'LOCAL — Unlimited by our software';
export const EXTERNAL_LABEL = 'EXTERNAL — Provider\'s own limits apply';

/**
 * The single entry point for all generation. Tries the provider chain in
 * order, skipping unhealthy/unconfigured providers, and falls back on
 * failure. The agent NEVER fully stops because one external API died.
 */
export async function generate(
  req: GenerationRequest,
  registry: Registry
): Promise<GenerationResult> {
  const tried: string[] = [];
  const warnings: string[] = [];
  let lastError: unknown = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let provider;
    try {
      provider = await registry.route(req.modality, { allowExternal: req.allowExternal, tried });
    } catch (e) {
      if (e instanceof NoProviderAvailableError) {
        throw lastError ?? e;
      }
      throw e;
    }
    try {
      const result = await provider.generate(req);
      result.fallbackChainUsed = tried.concat(result.providerId);
      result.warnings.push(...warnings);
      // Dashboard badge source of truth:
      result.warnings.push(
        provider.type === 'local' ? LOCAL_LABEL : provider.limitsNote ?? EXTERNAL_LABEL
      );
      return result;
    } catch (err) {
      lastError = err;
      tried.push(provider.id);
      warnings.push(
        `provider ${provider.id} failed (${(err as Error).message}); falling back`
      );
    }
  }
}

// Re-export for pipeline convenience.
export type { Modality };
