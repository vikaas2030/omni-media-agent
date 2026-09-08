import { Provider, Modality, NoProviderAvailableError } from './types.js';

export class Registry {
  private providers = new Map<string, Provider>();

  register(p: Provider): void {
    this.providers.set(p.id, p);
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  /** Resolve the ordered fallback chain for a modality. */
  chain(modality: Modality): Provider[] {
    return [...this.providers.values()]
      .filter((p) => p.modality === modality)
      .sort((a, b) => rank(a) - rank(b));
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

// local providers always rank before external ones — local-first fallback.
function rank(p: Provider): number {
  return p.type === 'local' ? 0 : 1;
}
