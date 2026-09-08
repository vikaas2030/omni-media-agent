export type Modality = 'llm' | 'image' | 'stt' | 'tts' | 'video' | 'avatar' | 'render';

export interface GenerationRequest {
  modality: Modality;
  input: unknown;             // prompt / image / audio path — provider interprets
  options?: Record<string, unknown>;
  allowExternal?: boolean;    // default true; external providers also require an API key
  fallbackTo?: Modality;       // e.g. video can degrade to a render/anim fallback
}

export interface GenerationResult {
  text?: string;
  artifactPath?: string;
  providerId: string;
  providerType: 'local' | 'external';
  fallbackChainUsed: string[];
  warnings: string[];          // e.g. "fell back from seedance (quota) to ffmpeg-anim"
  externalCostUsd?: number;    // observability ONLY — never enforced
}

export interface Provider {
  id: string;
  modality: Modality;
  type: 'local' | 'external';
  limitsNote?: string;         // shown for EXTERNAL providers in the dashboard
  health(): Promise<boolean>;
  generate(req: GenerationRequest): Promise<GenerationResult>;
}

export class NoProviderAvailableError extends Error {
  constructor(public modality: Modality, public tried: string[]) {
    super(`No provider available for ${modality}. Tried: ${tried.join(', ')}`);
  }
}
