import { Provider, GenerationRequest, GenerationResult, Modality } from '../core/types.js';
import { generateWithVeo } from './veo.js';
import { generateWithSeedance } from './seedance.js';
import { generateWithLtx } from './ltx.js';

const env = (k: string) => (process.env[k] ?? '').trim();

/**
 * Base for ALL external connectors. Rules:
 * - They only activate when their API key is present in the environment.
 * - They MUST carry a limitsNote — "Provider's own limits apply" is shown
 *   in the dashboard, never hidden in a footnote.
 * - When they fail or their quota is exhausted, the router falls back down
 *   the config chain (usually to a local/open-source provider). The agent
 *   does NOT go down with them.
 */
abstract class ExternalProvider implements Provider {
  type = 'external' as const;
  abstract id: string;
  abstract modality: Modality;
  abstract limitsNote: string;
  protected abstract envKey: string;

  async health(): Promise<boolean> {
    return env(this.envKey).length > 0;
  }

  abstract generate(req: GenerationRequest): Promise<GenerationResult>;

  protected result(providerId: string, artifactPath: string): GenerationResult {
    return {
      artifactPath,
      providerId,
      providerType: 'external',
      fallbackChainUsed: [],
      warnings: [],
    };
  }
}

/** Google Veo — Gemini API. */
class VeoProvider extends ExternalProvider {
  id = 'external:veo';
  modality = 'video' as const;
  limitsNote = 'Google Veo/Flow usage limits & fees apply';
  protected envKey = 'VEO_API_KEY';
  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const artifactPath = await generateWithVeo(String(req.input));
    return this.result(this.id, artifactPath);
  }
}

/** Seedance — BytePlus ModelArk. */
class SeedanceProvider extends ExternalProvider {
  id = 'external:seedance';
  modality = 'video' as const;
  limitsNote = 'Seedance usage limits & fees apply';
  protected envKey = 'SEEDANCE_API_KEY';
  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const artifactPath = await generateWithSeedance(String(req.input));
    return this.result(this.id, artifactPath);
  }
}

/** LTX-Video — fal.ai queue. */
class LtxProvider extends ExternalProvider {
  id = 'external:ltx';
  modality = 'video' as const;
  limitsNote = 'LTX via fal.ai usage limits & fees apply';
  protected envKey = 'LTX_API_KEY';
  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const artifactPath = await generateWithLtx(String(req.input));
    return this.result(this.id, artifactPath);
  }
}

/** Avatar APIs (HeyGen/D-ID style) — bring-your-own-key, one generic shape. */
class AvatarApiProvider extends ExternalProvider {
  id = 'external:avatar-api';
  modality = 'avatar' as const;
  limitsNote = 'Avatar provider usage limits & fees apply';
  protected envKey = 'AVATAR_API_KEY';
  async generate(_req: GenerationRequest): Promise<GenerationResult> {
    // Avatar providers differ wildly — implement against your vendor here.
    throw new Error('avatar-api: connector not implemented yet (bring-your-own-key)');
  }
}

export const externalProviders: Provider[] = [
  new VeoProvider(),
  new SeedanceProvider(),
  new LtxProvider(),
  new AvatarApiProvider(),
];
