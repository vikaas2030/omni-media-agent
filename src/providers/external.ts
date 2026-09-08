import { Provider, GenerationRequest, GenerationResult, Modality } from '../core/types.js';

const env = (k: string) => (process.env[k] ?? '').trim();

/**
 * Base for ALL external connectors. Rules:
 * - They only activate when their API key is present in the environment.
 * - They MUST carry a limitsNote — "Provider's own limits apply" is shown
 *   in the dashboard, never hidden in a footnote.
 * - When they fail or their quota is exhausted, the router falls back to
 *   local/open-source providers. The agent does NOT go down with them.
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

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    // TODO per connector (phase 4): real API call with the key from env.
    // Cost recorded is observability ONLY — the software never enforces limits.
    throw new Error(`${this.id}: connector not implemented yet (bring-your-own-key)`);
  }

  protected note(): string {
    return `${this.id}: EXTERNAL — ${this.limitsNote}`;
  }
}

class SeedanceProvider extends ExternalProvider {
  id = 'external:seedance';
  modality = 'video' as const;
  limitsNote = 'Seedance usage limits & fees apply';
  protected envKey = 'SEEDANCE_API_KEY';
}

class LtxProvider extends ExternalProvider {
  id = 'external:ltx';
  modality = 'video' as const;
  limitsNote = 'LTX usage limits & fees apply';
  protected envKey = 'LTX_API_KEY';
}

class VeoFlowProvider extends ExternalProvider {
  id = 'external:veo-flow';
  modality = 'video' as const;
  limitsNote = 'Google Flow/Veo usage limits & fees apply';
  protected envKey = 'VEO_API_KEY';
}

class AvatarApiProvider extends ExternalProvider {
  id = 'external:avatar-api';
  modality = 'avatar' as const;
  limitsNote = 'Avatar provider usage limits & fees apply';
  protected envKey = 'AVATAR_API_KEY';
}

export const externalProviders: Provider[] = [
  new SeedanceProvider(),
  new LtxProvider(),
  new VeoFlowProvider(),
  new AvatarApiProvider(),
];
