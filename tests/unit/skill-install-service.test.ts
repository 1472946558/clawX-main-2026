import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const storeData = new Map<string, unknown>();
let tempHome = '';

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

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => tempHome || actual.homedir(),
  };
});

function mockGithubFetch(skillMd = [
  '---',
  'name: Demo Skill',
  'version: 1.2.3',
  '---',
  '',
  '```bash',
  'pip install demo-package',
  'npm install',
  '```',
].join('\n')) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/repos/demo/skills/git/trees/main')) {
      return {
        ok: true,
        json: async () => ({
          tree: [
            { path: 'skills/demo/SKILL.md', type: 'blob', size: skillMd.length },
            { path: 'skills/demo/README.md', type: 'blob', size: 20 },
          ],
        }),
      };
    }
    if (url.includes('/repos/demo/skills')) {
      return {
        ok: true,
        json: async () => ({
          full_name: 'demo/skills',
          name: 'skills',
          html_url: 'https://github.com/demo/skills',
          default_branch: 'main',
        }),
      };
    }
    if (url.includes('/skills/demo/SKILL.md')) {
      return { ok: true, text: async () => skillMd };
    }
    if (url.includes('/skills/demo/README.md')) {
      return { ok: true, text: async () => '# Readme\nnode setup.js\n' };
    }
    return { ok: false, status: 404, statusText: 'Not Found' };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('skill install service', () => {
  beforeEach(async () => {
    storeData.clear();
    vi.resetModules();
    tempHome = await mkdtemp(join(tmpdir(), 'clawx-skill-install-'));
    process.env.CLAWX_SKILL_INSTALL_ROOT = join(tempHome, '.openclaw', 'skills');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (tempHome) {
      await rm(tempHome, { recursive: true, force: true });
    }
    delete process.env.CLAWX_SKILL_INSTALL_ROOT;
    tempHome = '';
  });

  it('sanitizes skill ids and rejects unsafe values', async () => {
    const { sanitizeSkillId } = await import('@electron/services/skills/skill-install-service');

    expect(sanitizeSkillId('Demo-Skill')).toBe('demo-skill');
    expect(() => sanitizeSkillId('../demo')).toThrow('Invalid skillId');
    expect(() => sanitizeSkillId('demo_skill')).toThrow('Invalid skillId');
  });

  it('rejects paths outside the OpenClaw skills root', async () => {
    const { assertInsideSkillsRoot } = await import('@electron/services/skills/skill-install-service');

    expect(() => assertInsideSkillsRoot(join(tempHome, '.openclaw', 'skills', 'demo'))).not.toThrow();
    expect(() => assertInsideSkillsRoot(join(tempHome, 'secrets'))).toThrow('Path escapes');
  });

  it('installs a GitHub skill, writes store and metadata, and detects commands without executing them', async () => {
    mockGithubFetch();
    const {
      getInstalledSkills,
      installFromGithub,
      skillInstallInternalsForTests,
    } = await import('@electron/services/skills/skill-install-service');

    const record = await installFromGithub({
      skillId: 'demo-skill',
      repositoryUrl: 'https://github.com/demo/skills',
      selectedInstallTarget: 'skills/demo',
    });

    expect(record).toMatchObject({
      skillId: 'demo-skill',
      status: 'installed_metadata_only',
      version: '1.2.3',
      hasSkillMd: true,
      hasManifest: false,
      source: 'github',
      sourceUrl: 'https://github.com/demo/skills',
    });
    expect(record.detectedCommands.map((command) => command.kind)).toEqual(expect.arrayContaining(['pip', 'npm', 'node']));
    expect(existsSync(join(record.installDir, 'SKILL.md'))).toBe(true);
    const metadataPath = skillInstallInternalsForTests.getInstallMetadataPath(record.installDir);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as typeof record;
    expect(metadata.skillId).toBe('demo-skill');
    expect((await getInstalledSkills()).map((skill) => skill.skillId)).toEqual(['demo-skill']);
  });

  it('cleans staging and records failure when GitHub download fails', async () => {
    mockGithubFetch();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/repos/demo/skills/git/trees/main')) {
        return {
          ok: true,
          json: async () => ({ tree: [{ path: 'skills/demo/SKILL.md', type: 'blob', size: 120 }] }),
        };
      }
      if (url.includes('/repos/demo/skills')) {
        return { ok: true, json: async () => ({ default_branch: 'main' }) };
      }
      return { ok: false, status: 500, statusText: 'Server Error' };
    }));
    const { getInstallStatus, installFromGithub } = await import('@electron/services/skills/skill-install-service');

    await expect(installFromGithub({
      skillId: 'demo-skill',
      repositoryUrl: 'https://github.com/demo/skills',
      selectedInstallTarget: 'skills/demo',
    })).rejects.toThrow('GitHub skill file download failed');

    const stagingRoot = join(tempHome, '.openclaw', 'skills', '.staging');
    expect(existsSync(stagingRoot) ? await readdir(stagingRoot) : []).toEqual([]);
    const status = await getInstallStatus('demo-skill');
    expect(status.status).toBe('failed');
    expect(status.record?.lastError).toContain('GitHub skill file download failed');
  });

  it('does not overwrite a non-Canvasland-managed skill directory', async () => {
    mockGithubFetch();
    const targetDir = join(tempHome, '.openclaw', 'skills', 'demo-skill');
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, 'SKILL.md'), '# User managed skill\n', 'utf8');
    const { installFromGithub } = await import('@electron/services/skills/skill-install-service');

    await expect(installFromGithub({
      skillId: 'demo-skill',
      repositoryUrl: 'https://github.com/demo/skills',
      selectedInstallTarget: 'skills/demo',
    })).rejects.toThrow('Refusing to overwrite');
  });

  it('uninstalls only Canvasland-managed skill directories', async () => {
    mockGithubFetch();
    const { getInstallStatus, installFromGithub, uninstall } = await import('@electron/services/skills/skill-install-service');
    const record = await installFromGithub({
      skillId: 'demo-skill',
      repositoryUrl: 'https://github.com/demo/skills',
      selectedInstallTarget: 'skills/demo',
    });

    await uninstall('demo-skill');

    expect(existsSync(record.installDir)).toBe(false);
    expect((await getInstallStatus('demo-skill')).status).toBe('not_installed');
    const unmanagedDir = join(tempHome, '.openclaw', 'skills', 'unmanaged');
    await mkdir(unmanagedDir, { recursive: true });
    await writeFile(join(unmanagedDir, 'SKILL.md'), '# User skill\n', 'utf8');
    await expect(uninstall('unmanaged')).rejects.toThrow('Refusing to uninstall');
  });
});
