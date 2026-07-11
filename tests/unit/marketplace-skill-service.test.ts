import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitMarketplaceImports,
  exportMarketplaceCatalog,
  getClawHubSlugForMarketplaceSkill,
  importMarketplaceCatalog,
  isCommercialLicense,
  loadMarketplaceSeedSkills,
  listApprovedMarketplaceSkills,
  listMarketplaceSkills,
  normalizeClawHubMarketplaceSkill,
  parseGitHubRepositoryUrl,
  partitionMarketplaceImportPreview,
  reviewMarketplaceSkill,
  resolveGitHubSkillInstallPlansFromTree,
  resolveGitHubSkillInstallPlanFromTree,
  updateMarketplaceSkill,
} from '@electron/services/skills/marketplace-skill-service';
import type { SkillMarketplaceItem } from '@shared/host-api/contract';
import { join } from 'node:path';

const storeData = new Map<string, unknown>();

vi.mock('electron-store', () => ({
  default: class MockStore {
    constructor(options?: { defaults?: Record<string, unknown> }) {
      for (const [key, value] of Object.entries(options?.defaults ?? {})) {
        if (!storeData.has(key)) {
          storeData.set(key, structuredClone(value));
        }
      }
    }

    get(key: string) {
      return storeData.get(key);
    }

    set(key: string, value: unknown) {
      storeData.set(key, structuredClone(value));
    }
  },
}));

describe('marketplace skill service', () => {
  beforeEach(() => {
    storeData.clear();
  });

  it('recognizes commercial-use open source licenses', () => {
    expect(isCommercialLicense('MIT')).toBe(true);
    expect(isCommercialLicense('Apache-2.0')).toBe(true);
    expect(isCommercialLicense('BSD-2-Clause')).toBe(true);
    expect(isCommercialLicense('BSD-3-Clause')).toBe(true);
    expect(isCommercialLicense('GPL-3.0')).toBe(false);
    expect(isCommercialLicense('NOASSERTION')).toBe(false);
  });

  it('loads the maintained marketplace seed catalog from resources', () => {
    const seeds = loadMarketplaceSeedSkills(join(process.cwd(), 'resources', 'skills', 'marketplace-seeds.json'));

    expect(seeds).toHaveLength(9);
    expect(seeds.every((skill) => skill.reviewStatus === 'approved')).toBe(true);
    expect(seeds.every((skill) => skill.commercialUseAllowed)).toBe(true);
    expect(seeds.every((skill) => isCommercialLicense(skill.license))).toBe(true);
    expect(seeds.every((skill) => skill.selectedInstallTarget?.startsWith('skills/'))).toBe(true);
    expect(seeds.map((skill) => skill.id)).toContain('security-and-hardening');
    expect(seeds.map((skill) => skill.repositoryUrl)).toContain('https://github.com/addyosmani/agent-skills');
  });

  it('parses common GitHub repository URLs', () => {
    expect(parseGitHubRepositoryUrl('https://github.com/VoltAgent/awesome-agent-skills')).toEqual({
      owner: 'VoltAgent',
      repo: 'awesome-agent-skills',
    });
    expect(parseGitHubRepositoryUrl('git@github.com:addyosmani/agent-skills.git')).toEqual({
      owner: 'addyosmani',
      repo: 'agent-skills',
    });
  });

  it('normalizes ClawHub results as pending review until license is known', () => {
    const skill = normalizeClawHubMarketplaceSkill({
      slug: 'demo-skill',
      name: 'Demo Skill',
      description: 'A useful ClawHub skill.',
      version: '1.0.0',
      downloads: 15600,
      stars: 42,
    }, '2026-07-09T00:00:00.000Z');

    expect(skill).toMatchObject({
      id: 'demo-skill',
      name: 'Demo Skill',
      downloads: '15.6k',
      rating: '42',
      license: 'Unknown',
      reviewStatus: 'pending',
      commercialUseAllowed: false,
      importSource: 'clawhub',
    });
  });

  it('extracts ClawHub install slugs only for ClawHub marketplace skills', () => {
    const skill = normalizeClawHubMarketplaceSkill({
      slug: 'demo-skill',
      name: 'Demo Skill',
      description: 'A useful ClawHub skill.',
      version: '1.0.0',
    });

    expect(getClawHubSlugForMarketplaceSkill(skill)).toBe('demo-skill');
    expect(() => getClawHubSlugForMarketplaceSkill({
      ...skill,
      id: 'github-skill',
      source: 'demo/github-skill',
      repositoryUrl: 'https://github.com/demo/github-skill',
      importSource: 'github',
    })).toThrow('Only ClawHub marketplace skills can be installed automatically');
  });


  it('keeps rejected imports separate from reviewable candidates', () => {
    const pending = normalizeClawHubMarketplaceSkill({
      slug: 'pending-skill',
      name: 'Pending Skill',
      description: 'Pending.',
      version: '1.0.0',
    });
    const rejected = {
      ...pending,
      id: 'rejected-skill',
      reviewStatus: 'rejected' as const,
    };

    expect(partitionMarketplaceImportPreview([pending, rejected])).toEqual({
      skills: [pending],
      rejected: [rejected],
    });
  });

  it('selects a safe GitHub skill directory from repository trees', () => {
    const input = {
      owner: 'demo',
      repo: 'skills',
      branch: 'main',
      tree: {
        tree: [
          { path: 'README.md', type: 'blob', size: 120 },
          { path: 'skills/research/SKILL.md', type: 'blob', size: 240 },
          { path: 'skills/research/references/guide.md', type: 'blob', size: 420 },
          { path: 'skills/write/SKILL.md', type: 'blob', size: 200 },
          { path: 'packages/app.ts', type: 'blob', size: 200 },
        ],
      },
    };
    const plans = resolveGitHubSkillInstallPlansFromTree(input);
    const plan = resolveGitHubSkillInstallPlanFromTree(input);

    expect(plans.map((candidate) => candidate.skillPath)).toEqual(['skills/research', 'skills/write']);
    expect(plan).toMatchObject({
      owner: 'demo',
      repo: 'skills',
      branch: 'main',
      skillPath: 'skills/research',
      totalBytes: 660,
    });
    expect(plan.files).toEqual([
      { sourcePath: 'skills/research/references/guide.md', targetPath: 'references/guide.md', size: 420 },
      { sourcePath: 'skills/research/SKILL.md', targetPath: 'SKILL.md', size: 240 },
    ]);

    expect(resolveGitHubSkillInstallPlanFromTree({
      ...input,
      selectedSkillPath: 'skills/write',
    })).toMatchObject({
      skillPath: 'skills/write',
      totalBytes: 200,
    });
  });

  it('rejects GitHub repositories without a SKILL.md manifest', () => {
    expect(() => resolveGitHubSkillInstallPlanFromTree({
      owner: 'demo',
      repo: 'no-skill',
      branch: 'main',
      tree: {
        tree: [
          { path: 'README.md', type: 'blob', size: 120 },
        ],
      },
    })).toThrow('No SKILL.md manifest found in this GitHub repository');
  });

  it('persists imported candidates and publishes only approved commercial-use skills', async () => {
    const imported: SkillMarketplaceItem = {
      id: 'demo-commercial-skill',
      name: 'Demo Commercial Skill',
      description: 'A pending commercial-use skill.',
      category: 'developer',
      iconText: 'D',
      tags: ['codingAgent'],
      rating: '1',
      downloads: '0',
      license: 'MIT',
      source: 'demo/commercial-skill',
      repositoryUrl: 'https://github.com/demo/commercial-skill',
      installStatus: 'planned',
      reviewStatus: 'pending',
      commercialUseAllowed: true,
      importSource: 'github',
      lastSyncedAt: '2026-07-10T00:00:00.000Z',
    };

    await commitMarketplaceImports([imported]);
    expect((await listMarketplaceSkills('pending')).map((skill) => skill.id)).toContain('demo-commercial-skill');
    expect((await listApprovedMarketplaceSkills()).map((skill) => skill.id)).not.toContain('demo-commercial-skill');

    await reviewMarketplaceSkill('demo-commercial-skill', 'approved');
    expect((await listApprovedMarketplaceSkills()).map((skill) => skill.id)).toContain('demo-commercial-skill');
  });

  it('exports and replaces the marketplace catalog for backend synchronization', async () => {
    const catalog = await exportMarketplaceCatalog();
    const replacement: SkillMarketplaceItem = {
      ...catalog.skills[0],
      id: 'backend-owned-skill',
      name: 'Backend Owned Skill',
      source: 'backend/owned-skill',
      repositoryUrl: 'https://github.com/backend/owned-skill',
    };

    await importMarketplaceCatalog({
      schemaVersion: 1,
      exportedAt: '2026-07-10T00:00:00.000Z',
      skills: [replacement],
    }, 'replace');

    const nextCatalog = await exportMarketplaceCatalog();
    expect(nextCatalog.skills.map((skill) => skill.id)).toEqual(['backend-owned-skill']);
  });

  it('blocks approving non-commercial imports until metadata is corrected', async () => {
    const imported = normalizeClawHubMarketplaceSkill({
      slug: 'unknown-license-skill',
      name: 'Unknown License Skill',
      description: 'License is not available from ClawHub search.',
      version: '1.0.0',
    }, '2026-07-10T00:00:00.000Z');

    await commitMarketplaceImports([imported]);
    await expect(reviewMarketplaceSkill('unknown-license-skill', 'approved')).rejects.toThrow(
      'Only commercial-use approved skills can be published',
    );

    await updateMarketplaceSkill('unknown-license-skill', {
      license: 'Apache-2.0',
      commercialUseAllowed: true,
    });
    await reviewMarketplaceSkill('unknown-license-skill', 'approved');
    expect((await listApprovedMarketplaceSkills()).map((skill) => skill.id)).toContain('unknown-license-skill');
  });
});
