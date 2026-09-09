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
 * Per-provider retries before falling down the chain. A transient blip
 * (socket hang-up, 502) shouldn't degrade quality by dropping to a weaker
 * provider — retry the same one first, THEN fall back.
 */
function providerRetries(): number {
  const v = Number(process.env.ROUTER_PROVIDER_RETRIES ?? 1);
  return Number.isFinite(v) ? Math.max(0, Math.min(3, Math.floor(v))) : 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The single entry point for all generation. Tries the provider chain in
 * order, skipping unhealthy/unconfigured providers, retrying transient
 * failures, and falling back on real failure. The agent NEVER fully stops
 * because one external API died.
 */
export async function generate(
  req: GenerationRequest,
  registry: Registry
): Promise<GenerationResult> {
  const tried: string[] = [];
  const warnings: string[] = [];
  const retries = providerRetries();
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
      let result: GenerationResult | undefined;
      for (let attempt = 0; attempt <= retries && !result; attempt++) {
        try {
          result = await provider.generate(req);
        } catch (err) {
          lastError = err;
          if (attempt < retries) {
            warnings.push(`provider ${provider.id} transient failure (${(err as Error).message}); retrying`);
            await sleep(300 * (attempt + 1));
          }
        }
      }
      if (!result) throw lastError ?? new Error(`${provider.id} failed`);
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
