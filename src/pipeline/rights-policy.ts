export interface RightsCheckInput {
  title: string;
  script: string;
  musicSource?: 'licensed' | 'royalty-free' | 'unknown';
  usesThirdPartyFootage: boolean;
  platform: 'youtube' | 'instagram' | 'facebook';
}

export interface RightsCheckResult {
  passed: boolean;
  issues: string[];
  warnings: string[];
}

const PLATFORM_POLICY_FLAGS: Record<string, string[]> = {
  youtube: ['misleading thumbnail', 'reused content', 'harmful or dangerous'],
  instagram: ['misleading information', 'inappropriate content'],
  facebook: ['sensational content', 'misleading claims'],
};

/**
 * Pre-publish gate. Runs BEFORE any upload — a hard fail blocks publishing,
 * a warning is surfaced for the approval flow (autonomous vs approval modes
 * decide what happens next).
 */
export function rightsPolicyCheck(input: RightsCheckInput): RightsCheckResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (input.musicSource === 'unknown') {
    issues.push('Music source unknown — music must be licensed or royalty-free before publishing.');
  }
  if (input.usesThirdPartyFootage) {
    issues.push('Third-party footage present — written permission or a valid license is required.');
  }

  const flags = PLATFORM_POLICY_FLAGS[input.platform] ?? [];
  const script = input.script.toLowerCase();
  for (const flag of flags) {
    if (script.includes(flag)) {
      warnings.push(`Possible platform-policy issue (${input.platform}): "${flag}" — review before publishing.`);
    }
  }

  return { passed: issues.length === 0, issues, warnings };
}
