import type { GatewayManager } from '../gateway/manager';
import type { ClawHubService, ClawHubInstallParams, ClawHubSearchParams, ClawHubUninstallParams } from '../gateway/clawhub';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { getAllSkillConfigs, getSkillConfig, updateSkillConfig, updateSkillConfigs } from '../utils/skill-config';
import { getOpenClawSkillsDir } from '../utils/paths';
import {
  collectQuickAccessSkills,
  filterEnabledQuickAccessSkills,
  type QuickAccessRuntimeSkillStatus,
} from '../utils/skill-quick-access';
import { listLocalSkills } from './skills/local-skill-service';
import {
  commitMarketplaceImports,
  exportMarketplaceCatalog,
  getClawHubSlugForMarketplaceSkill,
  getMarketplaceSkill,
  importMarketplaceCatalog,
  listMarketplaceSkills,
  listApprovedMarketplaceSkills,
  normalizeClawHubMarketplaceSkill,
  partitionMarketplaceImportPreview,
  previewGitHubMarketplaceImport,
  reviewMarketplaceSkill,
  updateMarketplaceSkill,
} from './skills/marketplace-skill-service';
import {
  getInstalledSkills,
  getInstallStatus,
  installFromGithub,
  installFromLocal,
  scanSkillDir,
  uninstall,
} from './skills/skill-install-service';
import { isRecord } from './payload-utils';
import { join } from 'node:path';
import type {
  SkillMarketplaceImportPreviewPayload,
  SkillMarketplaceCatalog,
  SkillMarketplaceItem,
  SkillMarketplaceReviewStatus,
} from '../../shared/host-api/contract';

type SkillConfigPayload = {
  skillKey?: unknown;
  enabled?: unknown;
  apiKey?: unknown;
  env?: unknown;
};

type SkillConfigsPayload = {
  updates?: unknown;
};

type NormalizedSkillConfigUpdate = {
  skillKey: string;
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
};

type QuickAccessPayload = {
  workspace?: unknown;
};

type SkillOpenPayload = {
  slug?: unknown;
  skillKey?: unknown;
  baseDir?: unknown;
};

type MarketplaceImportPreviewInput = {
  source?: unknown;
  repositoryUrl?: unknown;
  query?: unknown;
  limit?: unknown;
};

type MarketplaceAdminListInput = {
  reviewStatus?: unknown;
};

type MarketplaceImportCommitInput = {
  skills?: unknown;
};

type MarketplaceImportCatalogInput = {
  catalog?: unknown;
  mode?: unknown;
};

type MarketplaceReviewInput = {
  id?: unknown;
  reviewStatus?: unknown;
};

type MarketplaceUpdateInput = {
  id?: unknown;
  patch?: unknown;
};

type MarketplaceInstallInput = {
  id?: unknown;
};

type InstallFromGithubInput = {
  skillId?: unknown;
  repositoryUrl?: unknown;
  selectedInstallTarget?: unknown;
};

type InstallFromLocalInput = {
  skillId?: unknown;
  localDir?: unknown;
};

type InstallStatusInput = {
  skillId?: unknown;
};

type UninstallInput = {
  skillId?: unknown;
};

type ScanSkillDirInput = {
  skillId?: unknown;
  dir?: unknown;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getSkillKey(payload: unknown): string {
  const body = isRecord(payload) ? payload as SkillConfigPayload : {};
  if (typeof body.skillKey !== 'string' || !body.skillKey.trim()) {
    throw new Error('skillKey is required');
  }
  return body.skillKey.trim();
}

function getEnv(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function getConfigUpdate(payload: unknown): NormalizedSkillConfigUpdate {
  const body = isRecord(payload) ? payload as SkillConfigPayload : {};
  return {
    skillKey: getSkillKey(payload),
    enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
    env: getEnv(body.env),
  };
}

function getConfigUpdates(payload: unknown): NormalizedSkillConfigUpdate[] {
  const body = isRecord(payload) ? payload as SkillConfigsPayload : {};
  if (!Array.isArray(body.updates)) return [];
  return body.updates.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const skillKey = typeof entry.skillKey === 'string' ? entry.skillKey.trim() : '';
    if (!skillKey) return [];
    return [{
      skillKey,
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : undefined,
      apiKey: typeof entry.apiKey === 'string' ? entry.apiKey : undefined,
      env: getEnv(entry.env),
    }];
  });
}

function getMarketplaceImportPreviewPayload(payload: unknown): SkillMarketplaceImportPreviewPayload {
  const body = isRecord(payload) ? payload as MarketplaceImportPreviewInput : {};
  if (body.source === 'github') {
    if (typeof body.repositoryUrl !== 'string' || !body.repositoryUrl.trim()) {
      throw new Error('repositoryUrl is required');
    }
    return {
      source: 'github',
      repositoryUrl: body.repositoryUrl.trim(),
    };
  }
  if (body.source === 'clawhub') {
    return {
      source: 'clawhub',
      query: typeof body.query === 'string' ? body.query : undefined,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
    };
  }
  throw new Error('source must be github or clawhub');
}

function getMarketplaceReviewStatus(value: unknown): SkillMarketplaceReviewStatus {
  if (value === 'approved' || value === 'pending' || value === 'rejected') {
    return value;
  }
  throw new Error('reviewStatus must be approved, pending, or rejected');
}

function getMarketplaceId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('id is required');
  }
  return value.trim();
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

export function createSkillsApi({
  clawHubService,
  gatewayManager,
}: {
  clawHubService: ClawHubService;
  gatewayManager: GatewayManager;
}): CompleteHostServiceRegistry['skills'] {
  return {
    local: async () => ({ success: true, skills: await listLocalSkills() }),
    configs: async () => getAllSkillConfigs(),
    allConfigs: async () => getAllSkillConfigs(),
    getConfig: async (payload) => {
      const config = await getSkillConfig(getSkillKey(payload));
      return config ? { ...config } : undefined;
    },
    updateConfig: async (payload) => {
      const { skillKey, ...updates } = getConfigUpdate(payload);
      return updateSkillConfig(skillKey, updates);
    },
    updateConfigs: async (payload) => updateSkillConfigs(getConfigUpdates(payload)),
    status: async () => gatewayManager.rpc('skills.status'),
    update: async (payload) => gatewayManager.rpc('skills.update', isRecord(payload) ? payload : {}),
    quickAccess: async (payload) => {
      const body = isRecord(payload) ? payload as QuickAccessPayload : {};
      const [scannedSkills, configs] = await Promise.all([
        collectQuickAccessSkills({
          workspace: typeof body.workspace === 'string' ? body.workspace : undefined,
        }),
        getAllSkillConfigs(),
      ]);
      let runtimeSkills: QuickAccessRuntimeSkillStatus[] | undefined;
      if (gatewayManager.getStatus().state === 'running') {
        try {
          const runtimeStatus = await gatewayManager.rpc<{ skills?: QuickAccessRuntimeSkillStatus[] }>('skills.status');
          runtimeSkills = runtimeStatus.skills || [];
        } catch {
          runtimeSkills = undefined;
        }
      }
      return {
        success: true,
        skills: filterEnabledQuickAccessSkills(scannedSkills, runtimeSkills, configs),
      };
    },
    marketplaceList: async () => {
      try {
        return { success: true, skills: await listApprovedMarketplaceSkills() };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    marketplaceAdminList: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as MarketplaceAdminListInput : {};
        const reviewStatus = body.reviewStatus === 'all' || body.reviewStatus === undefined
          ? 'all'
          : getMarketplaceReviewStatus(body.reviewStatus);
        return { success: true, skills: await listMarketplaceSkills(reviewStatus) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    marketplaceImportPreview: async (payload) => {
      try {
        const input = getMarketplaceImportPreviewPayload(payload);
        const importedSkills = input.source === 'github'
          ? await previewGitHubMarketplaceImport(input.repositoryUrl)
          : (await clawHubService.search({
            query: input.query || '',
            limit: input.limit,
          })).map((skill) => normalizeClawHubMarketplaceSkill(skill));
        const { skills, rejected } = partitionMarketplaceImportPreview(importedSkills);
        return { success: true, source: input.source, skills, rejected };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    marketplaceImportCommit: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as MarketplaceImportCommitInput : {};
        const skills = Array.isArray(body.skills) ? body.skills.filter((skill): skill is SkillMarketplaceItem => isRecord(skill)) : [];
        return { success: true, skills: await commitMarketplaceImports(skills) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    marketplaceExportCatalog: async () => {
      try {
        return { success: true, catalog: await exportMarketplaceCatalog() };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    marketplaceImportCatalog: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as MarketplaceImportCatalogInput : {};
        if (!isRecord(body.catalog)) {
          throw new Error('catalog is required');
        }
        const mode = body.mode === 'replace' ? 'replace' : 'merge';
        return {
          success: true,
          skills: await importMarketplaceCatalog(body.catalog as SkillMarketplaceCatalog, mode),
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    marketplaceReview: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as MarketplaceReviewInput : {};
        const skill = await reviewMarketplaceSkill(
          getMarketplaceId(body.id),
          getMarketplaceReviewStatus(body.reviewStatus),
        );
        return { success: true, skill };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    marketplaceUpdate: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as MarketplaceUpdateInput : {};
        const patch = isRecord(body.patch) ? body.patch : {};
        const skill = await updateMarketplaceSkill(
          getMarketplaceId(body.id),
          patch as Partial<Omit<SkillMarketplaceItem, 'id' | 'lastSyncedAt'>>,
        );
        return { success: true, skill };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    marketplaceInstall: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as MarketplaceInstallInput : {};
        const id = getMarketplaceId(body.id);
        const skill = await getMarketplaceSkill(id);
        if (skill.reviewStatus !== 'approved' || !skill.commercialUseAllowed) {
          throw new Error('Only approved commercial-use skills can be installed');
        }
        let installPath = skill.importSource === 'github'
          ? (await installFromGithub({
            skillId: skill.id,
            repositoryUrl: skill.repositoryUrl,
            selectedInstallTarget: skill.selectedInstallTarget,
          })).installDir
          : undefined;
        let runtimeSkillKey = skill.id;
        if (skill.importSource === 'clawhub') {
          const slug = getClawHubSlugForMarketplaceSkill(skill);
          await clawHubService.install({ slug });
          installPath = join(getOpenClawSkillsDir(), slug);
          runtimeSkillKey = slug;
        }
        if (skill.importSource !== 'github' && skill.importSource !== 'clawhub') {
          throw new Error('Only GitHub and ClawHub marketplace skills can be installed automatically');
        }
        const enableResult = await updateSkillConfig(runtimeSkillKey, { enabled: true });
        if (!enableResult.success) {
          throw new Error(enableResult.error || 'Skill installed but could not be enabled');
        }
        const installedAt = new Date().toISOString();
        return {
          success: true,
          skill: await updateMarketplaceSkill(id, {
            installStatus: 'installed',
            installPath,
            installedAt,
            installError: '',
          }),
          installPath,
        };
      } catch (error) {
        const body = isRecord(payload) ? payload as MarketplaceInstallInput : {};
        const id = typeof body.id === 'string' ? body.id.trim() : '';
        if (id) {
          await updateMarketplaceSkill(id, { installError: errorMessage(error) }).catch(() => undefined);
        }
        return { success: false, error: errorMessage(error) };
      }
    },
    installFromGithub: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as InstallFromGithubInput : {};
        return {
          success: true,
          record: await installFromGithub({
            skillId: requireString(body.skillId, 'skillId'),
            repositoryUrl: requireString(body.repositoryUrl, 'repositoryUrl'),
            selectedInstallTarget: typeof body.selectedInstallTarget === 'string' ? body.selectedInstallTarget : undefined,
          }),
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    installFromLocal: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as InstallFromLocalInput : {};
        return {
          success: true,
          record: await installFromLocal({
            skillId: requireString(body.skillId, 'skillId'),
            localDir: requireString(body.localDir, 'localDir'),
          }),
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    getInstalledSkills: async () => {
      try {
        return { success: true, skills: await getInstalledSkills() };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    getInstallStatus: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as InstallStatusInput : {};
        return await getInstallStatus(requireString(body.skillId, 'skillId'));
      } catch (error) {
        return { success: false, error: errorMessage(error), status: 'failed' };
      }
    },
    uninstall: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as UninstallInput : {};
        await uninstall(requireString(body.skillId, 'skillId'));
        return { success: true };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    scanSkillDir: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as ScanSkillDirInput : {};
        return await scanSkillDir({
          skillId: typeof body.skillId === 'string' ? body.skillId : undefined,
          dir: requireString(body.dir, 'dir'),
        });
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    clawhubCapability: async () => {
      try {
        return { success: true, capability: await clawHubService.getMarketplaceCapability() };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    clawhubList: async () => {
      try {
        return { success: true, results: await clawHubService.listInstalled() };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    clawhubSearch: async (payload) => {
      try {
        return { success: true, results: await clawHubService.search((isRecord(payload) ? payload : {}) as ClawHubSearchParams) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    clawhubInstall: async (payload) => {
      try {
        await clawHubService.install((isRecord(payload) ? payload : {}) as ClawHubInstallParams);
        return { success: true };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    clawhubUninstall: async (payload) => {
      try {
        await clawHubService.uninstall((isRecord(payload) ? payload : {}) as ClawHubUninstallParams);
        return { success: true };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    clawhubOpenSkillReadme: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as SkillOpenPayload : {};
        const skillKey = typeof body.skillKey === 'string' ? body.skillKey : '';
        const slug = typeof body.slug === 'string' ? body.slug : undefined;
        const baseDir = typeof body.baseDir === 'string' ? body.baseDir : undefined;
        await clawHubService.openSkillReadme(skillKey || slug || '', slug, baseDir);
        return { success: true };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    clawhubOpenSkillPath: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as SkillOpenPayload : {};
        const skillKey = typeof body.skillKey === 'string' ? body.skillKey : '';
        const slug = typeof body.slug === 'string' ? body.slug : undefined;
        const baseDir = typeof body.baseDir === 'string' ? body.baseDir : undefined;
        await clawHubService.openSkillPath(skillKey || slug || '', slug, baseDir);
        return { success: true };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  };
}
