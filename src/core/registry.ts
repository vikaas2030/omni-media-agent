import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { Provider, Modality, NoProviderAvailableError } from './types.js';

interface RoutingConfig {
  routing: Record<string, string[]>;
}

/**
 * The chain order in config/models.json is AUTHORITATIVE — tried top to bottom.
 * For most modalities that means local first. For video it means:
 * external (if you configured a key) first, local FFmpeg floor last.
 */
function loadRouting(): Record<string, string[]> {
  try {
    const path = new URL('../../config/models.json', import.meta.url);
    const cfg = JSON.parse(readFileSync(path, 'utf-8')) as RoutingConfig;
    return cfg.routing ?? {};
  } catch {
    return {}; // providers still resolvable via register/chain fallback below
  }
}

export class Registry {
  private providers = new Map<string, Provider>();
  private routing = loadRouting();

  register(p: Provider): void {
    this.providers.set(p.id, p);
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  /** Ordered fallback chain for a modality — config order first, then any
   *  registered providers not mentioned in config (local before external). */
  chain(modality: Modality): Provider[] {
    const ordered = (this.routing[modality] ?? [])
      .map((id) => this.providers.get(id))
      .filter((p): p is Provider => !!p);

    const configured = new Set(ordered.map((p) => p.id));
    const rest = [...this.providers.values()]
      .filter((p) => p.modality === modality && !configured.has(p.id))
      .sort((a, b) => (a.type === 'local' ? -1 : 0) - (b.type === 'local' ? -1 : 0));

    return [...ordered, ...rest];
  }

  /** Route a request through the chain with health checks and external gating. */
  async route(
    modality: Modality,
    req: { allowExternal?: boolean; tried?: string[] }
  ): Promise<Provider> {
    const allowExternal = req.allowExternal ?? true;
    const tried: string[] = req.tried ?? [];
    for (const p of this.chain(modality)) {
      if (tried.includes(p.id)) continue;
      if (p.type === 'external' && !allowExternal) continue;
      if (!(await p.health())) continue;
      return p;
    }
    throw new NoProviderAvailableError(modality, tried);
  }
}
