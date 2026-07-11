import type {
  SkillMarketplaceCommercialLicense,
  SkillMarketplaceCatalog,
  SkillMarketplaceInstallTarget,
  SkillMarketplaceItem,
  SkillMarketplaceReviewStatus,
} from '../../../shared/host-api/contract';
import type { MarketplaceSkillResult } from '../../gateway/clawhub';
import { getOpenClawSkillsDir, getResourcesDir } from '../../utils/paths';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import posixPath from 'node:path/posix';

const SYNCED_AT = '2026-07-09T00:00:00.000Z';
const STORE_NAME = 'skill-marketplace';
const STORE_SKILLS_KEY = 'skills';
const MARKETPLACE_SEEDS_FILE = 'marketplace-seeds.json';
const GITHUB_INSTALL_MAX_FILES = 80;
const GITHUB_INSTALL_MAX_FILE_BYTES = 512 * 1024;
const GITHUB_INSTALL_MAX_TOTAL_BYTES = 3 * 1024 * 1024;
const COMMERCIAL_LICENSES = new Set<SkillMarketplaceCommercialLicense>([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
]);

export const MARKETPLACE_SKILL_SEEDS: SkillMarketplaceItem[] = [
  {
    id: 'production-engineering',
    name: 'Production Engineering Skills',
    description: 'Production-grade engineering workflows for AI coding agents, including quality gates, implementation discipline, and review habits.',
    category: 'developer',
    iconText: 'C',
    tags: ['codingAgent'],
    rating: '80',
    downloads: '18.3k',
    license: 'MIT',
    source: 'addyosmani/agent-skills',
    repositoryUrl: 'https://github.com/addyosmani/agent-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: SYNCED_AT,
  },
  {
    id: 'awesome-agent-skills',
    name: 'Awesome Agent Skills',
    description: 'A large curated directory of cross-agent skills compatible with Claude Code, Codex, Gemini CLI, Cursor, and similar tools.',
    category: 'hot',
    iconText: 'S',
    tags: ['directory'],
    rating: '4.8',
    downloads: '95.6k',
    license: 'MIT',
    source: 'VoltAgent/awesome-agent-skills',
    repositoryUrl: 'https://github.com/VoltAgent/awesome-agent-skills',
    installStatus: 'installed',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: SYNCED_AT,
  },
  {
    id: 'agent-toolkit',
    name: 'Agent Toolkit',
    description: 'A practical collection of skills for development, documentation, planning, automation, and professional workflows.',
    category: 'ai',
    iconText: 'F',
    tags: ['codingAgent'],
    rating: '1.5k',
    downloads: '59k',
    license: 'MIT',
    source: 'softaworks/agent-toolkit',
    repositoryUrl: 'https://github.com/softaworks/agent-toolkit',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: SYNCED_AT,
  },
  {
    id: 'ai-skills',
    name: 'AI Skills',
    description: 'Compact behavioral skills for coding assistants, focused on rules, review discipline, and safer agent behavior.',
    category: 'safe',
    iconText: 'S',
    tags: ['rules'],
    rating: '1.5k',
    downloads: '33.1k',
    license: 'MIT',
    source: 'iliaal/ai-skills',
    repositoryUrl: 'https://github.com/iliaal/ai-skills',
    installStatus: 'available',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: SYNCED_AT,
  },
  {
    id: 'cursor-skills',
    name: 'Cursor Skills',
    description: 'Cursor-oriented best-practice skills that can inform IDE workflow, coding standards, and reusable project guidance.',
    category: 'developer',
    iconText: 'M',
    tags: ['cursor'],
    rating: '10',
    downloads: '7.3k',
    license: 'MIT',
    source: 'araguaci/cursor-skills',
    repositoryUrl: 'https://github.com/araguaci/cursor-skills',
    installStatus: 'planned',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: SYNCED_AT,
  },
  {
    id: 'universal-agent-skills',
    name: 'Universal Agent Skills',
    description: 'Universal self-contained skills for real-world tasks such as writing, research, analysis, and agent collaboration.',
    category: 'content',
    iconText: 'S',
    tags: ['writing'],
    rating: '979',
    downloads: '52.6k',
    license: 'MIT',
    source: 'seb1n/awesome-ai-agent-skills',
    repositoryUrl: 'https://github.com/seb1n/awesome-ai-agent-skills',
    installStatus: 'planned',
    reviewStatus: 'approved',
    commercialUseAllowed: true,
    importSource: 'github',
    lastSyncedAt: SYNCED_AT,
  },
];

type MarketplaceSeedCatalog = {
  schemaVersion?: number;
  skills?: unknown;
};

// Lazy-load electron-store from the main process only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let marketplaceStore: any = null;

async function getMarketplaceStore() {
  if (!marketplaceStore) {
    const Store = (await import('electron-store')).default;
    marketplaceStore = new Store({
      name: STORE_NAME,
      defaults: {
        [STORE_SKILLS_KEY]: loadMarketplaceSeedSkills(),
      },
    });
  }
  return marketplaceStore;
}

function isMarketplaceSkill(value: unknown): value is SkillMarketplaceItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SkillMarketplaceItem>;
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.description === 'string'
    && typeof item.category === 'string'
    && typeof item.iconText === 'string'
    && Array.isArray(item.tags)
    && typeof item.rating === 'string'
    && typeof item.downloads === 'string'
    && typeof item.license === 'string'
    && typeof item.source === 'string'
    && typeof item.repositoryUrl === 'string'
    && typeof item.installStatus === 'string'
    && typeof item.reviewStatus === 'string'
    && typeof item.commercialUseAllowed === 'boolean'
    && typeof item.importSource === 'string'
    && typeof item.lastSyncedAt === 'string'
    && (item.installTargets === undefined || Array.isArray(item.installTargets))
    && (item.selectedInstallTarget === undefined || typeof item.selectedInstallTarget === 'string')
    && (item.installPath === undefined || typeof item.installPath === 'string')
    && (item.installedAt === undefined || typeof item.installedAt === 'string')
    && (item.installError === undefined || typeof item.installError === 'string');
}

function getMarketplaceSeedCandidates(): string[] {
  return [
    path.join(process.cwd(), 'resources', 'skills', MARKETPLACE_SEEDS_FILE),
    path.join(getResourcesDir(), 'skills', MARKETPLACE_SEEDS_FILE),
  ];
}

export function loadMarketplaceSeedSkills(seedPath?: string): SkillMarketplaceItem[] {
  const candidates = seedPath ? [seedPath] : getMarketplaceSeedCandidates();
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as MarketplaceSeedCatalog;
      if (!Array.isArray(parsed.skills)) continue;
      const skills = parsed.skills.filter(isMarketplaceSkill);
      if (skills.length > 0) return skills;
    } catch {
      continue;
    }
  }
  return [...MARKETPLACE_SKILL_SEEDS];
}

async function readMarketplaceSkills(): Promise<SkillMarketplaceItem[]> {
  const store = await getMarketplaceStore();
  const raw = store.get(STORE_SKILLS_KEY) as unknown;
  if (!Array.isArray(raw)) return [...MARKETPLACE_SKILL_SEEDS];
  return raw.filter(isMarketplaceSkill);
}

async function writeMarketplaceSkills(skills: SkillMarketplaceItem[]): Promise<void> {
  const store = await getMarketplaceStore();
  const ordered = [...skills].sort((a, b) => {
    if (a.reviewStatus !== b.reviewStatus) {
      const rank: Record<SkillMarketplaceReviewStatus, number> = { approved: 0, pending: 1, rejected: 2 };
      return rank[a.reviewStatus] - rank[b.reviewStatus];
    }
    return a.name.localeCompare(b.name);
  });
  store.set(STORE_SKILLS_KEY, ordered);
}

export async function listApprovedMarketplaceSkills(): Promise<SkillMarketplaceItem[]> {
  return (await readMarketplaceSkills())
    .filter((skill) => skill.reviewStatus === 'approved' && skill.commercialUseAllowed);
}

export async function listMarketplaceSkills(
  reviewStatus: SkillMarketplaceReviewStatus | 'all' = 'all',
): Promise<SkillMarketplaceItem[]> {
  const skills = await readMarketplaceSkills();
  return reviewStatus === 'all'
    ? skills
    : skills.filter((skill) => skill.reviewStatus === reviewStatus);
}

export async function getMarketplaceSkill(id: string): Promise<SkillMarketplaceItem> {
  const skill = (await readMarketplaceSkills()).find((item) => item.id === id);
  if (!skill) {
    throw new Error('Skill marketplace item not found');
  }
  return skill;
}

export async function commitMarketplaceImports(skills: SkillMarketplaceItem[]): Promise<SkillMarketplaceItem[]> {
  const existing = await readMarketplaceSkills();
  const byId = new Map(existing.map((skill) => [skill.id, skill]));
  const now = new Date().toISOString();
  for (const skill of skills.filter(isMarketplaceSkill)) {
    const previous = byId.get(skill.id);
    byId.set(skill.id, {
      ...previous,
      ...skill,
      reviewStatus: skill.reviewStatus,
      lastSyncedAt: now,
    });
  }
  const nextSkills = [...byId.values()];
  await writeMarketplaceSkills(nextSkills);
  return skills.map((skill) => byId.get(skill.id)).filter((skill): skill is SkillMarketplaceItem => Boolean(skill));
}

export async function exportMarketplaceCatalog(): Promise<SkillMarketplaceCatalog> {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    skills: await readMarketplaceSkills(),
  };
}

export async function importMarketplaceCatalog(
  catalog: SkillMarketplaceCatalog,
  mode: 'merge' | 'replace' = 'merge',
): Promise<SkillMarketplaceItem[]> {
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.skills)) {
    throw new Error('Unsupported skill marketplace catalog schema');
  }
  const skills = catalog.skills.filter(isMarketplaceSkill);
  if (skills.length !== catalog.skills.length) {
    throw new Error('Skill marketplace catalog contains invalid items');
  }
  if (mode === 'replace') {
    await writeMarketplaceSkills(skills);
    return skills;
  }
  return commitMarketplaceImports(skills);
}

export async function updateMarketplaceSkill(
  id: string,
  patch: Partial<Omit<SkillMarketplaceItem, 'id' | 'lastSyncedAt'>>,
): Promise<SkillMarketplaceItem> {
  const skills = await readMarketplaceSkills();
  const index = skills.findIndex((skill) => skill.id === id);
  if (index < 0) {
    throw new Error('Skill marketplace item not found');
  }
  const updated: SkillMarketplaceItem = {
    ...skills[index],
    ...patch,
    id,
    lastSyncedAt: new Date().toISOString(),
  };
  skills[index] = updated;
  await writeMarketplaceSkills(skills);
  return updated;
}

export async function reviewMarketplaceSkill(
  id: string,
  reviewStatus: SkillMarketplaceReviewStatus,
): Promise<SkillMarketplaceItem> {
  const skills = await readMarketplaceSkills();
  const skill = skills.find((item) => item.id === id);
  if (!skill) {
    throw new Error('Skill marketplace item not found');
  }
  if (reviewStatus === 'approved' && !skill.commercialUseAllowed) {
    throw new Error('Only commercial-use approved skills can be published');
  }
  return updateMarketplaceSkill(id, { reviewStatus });
}

export function getClawHubSlugForMarketplaceSkill(skill: SkillMarketplaceItem): string {
  if (skill.importSource !== 'clawhub') {
    throw new Error('Only ClawHub marketplace skills can be installed automatically');
  }
  const sourceSlug = skill.source.startsWith('clawhub/') ? skill.source.slice('clawhub/'.length) : '';
  const slug = sourceSlug || skill.id;
  if (!slug.trim()) {
    throw new Error('ClawHub skill slug is missing');
  }
  return slug.trim();
}

type GitHubRepositoryApiResult = {
  full_name?: string;
  name?: string;
  description?: string | null;
  html_url?: string;
  stargazers_count?: number;
  default_branch?: string;
};

type GitHubLicenseApiResult = {
  license?: {
    spdx_id?: string | null;
  } | null;
};

type GitHubTreeApiResult = {
  tree?: Array<{
    path?: string;
    type?: 'blob' | 'tree' | string;
    size?: number;
  }>;
  truncated?: boolean;
};

export type GitHubMarketplaceInstallPlan = {
  owner: string;
  repo: string;
  branch: string;
  skillPath: string;
  files: Array<{
    sourcePath: string;
    targetPath: string;
    size: number;
  }>;
  totalBytes: number;
};

function formatCompactNumber(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '0';
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleize(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function iconTextForName(value: string): string {
  const first = value.trim().match(/[a-z0-9]/i)?.[0] || 'S';
  return first.toUpperCase();
}

export function isCommercialLicense(license: string): license is SkillMarketplaceCommercialLicense {
  return COMMERCIAL_LICENSES.has(license as SkillMarketplaceCommercialLicense);
}

export function getMarketplaceReviewStatus(license: string): SkillMarketplaceItem['reviewStatus'] {
  return isCommercialLicense(license) ? 'pending' : 'rejected';
}

export function parseGitHubRepositoryUrl(repositoryUrl: string): { owner: string; repo: string } {
  const trimmed = repositoryUrl.trim();
  const match = trimmed.match(/github\.com[:/]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (!match) {
    throw new Error('A valid GitHub repository URL is required');
  }
  return {
    owner: match[1],
    repo: match[2],
  };
}

function normalizeRepositorySkill(input: {
  fullName: string;
  name: string;
  description?: string | null;
  repositoryUrl: string;
  stars?: number;
  license: string;
  installTargets?: SkillMarketplaceInstallTarget[];
  syncedAt?: string;
}): SkillMarketplaceItem {
  const reviewStatus = getMarketplaceReviewStatus(input.license);
  const selectedInstallTarget = input.installTargets?.[0]?.skillPath;
  return {
    id: slugify(input.fullName),
    name: titleize(input.name),
    description: input.description?.trim() || 'Imported GitHub skill repository awaiting editorial description.',
    category: 'developer',
    iconText: iconTextForName(input.name),
    tags: ['codingAgent'],
    rating: formatCompactNumber(input.stars),
    downloads: '0',
    license: input.license,
    source: input.fullName,
    repositoryUrl: input.repositoryUrl,
    installStatus: 'planned',
    reviewStatus,
    commercialUseAllowed: isCommercialLicense(input.license),
    importSource: 'github',
    lastSyncedAt: input.syncedAt || new Date().toISOString(),
    installTargets: input.installTargets,
    selectedInstallTarget,
  };
}

export function normalizeClawHubMarketplaceSkill(
  skill: MarketplaceSkillResult,
  syncedAt = new Date().toISOString(),
): SkillMarketplaceItem {
  return {
    id: slugify(skill.slug),
    name: skill.name || titleize(skill.slug),
    description: skill.description || 'Imported ClawHub skill awaiting license and editorial review.',
    category: 'ai',
    iconText: iconTextForName(skill.name || skill.slug),
    tags: ['general'],
    rating: formatCompactNumber(skill.stars),
    downloads: formatCompactNumber(skill.downloads),
    license: 'Unknown',
    source: `clawhub/${skill.slug}`,
    repositoryUrl: '',
    installStatus: 'planned',
    reviewStatus: 'pending',
    commercialUseAllowed: false,
    importSource: 'clawhub',
    lastSyncedAt: syncedAt,
  };
}

async function fetchGitHubJson<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'canvasland-skill-marketplace-importer',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub import failed: ${response.status} ${response.statusText}`);
  }
  return await response.json() as T;
}

async function fetchGitHubText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github.raw',
      'user-agent': 'canvasland-skill-marketplace-installer',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub skill file download failed: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

export async function previewGitHubMarketplaceImport(repositoryUrl: string): Promise<SkillMarketplaceItem[]> {
  const { owner, repo } = parseGitHubRepositoryUrl(repositoryUrl);
  const [repository, license] = await Promise.all([
    fetchGitHubJson<GitHubRepositoryApiResult>(`/repos/${owner}/${repo}`),
    fetchGitHubJson<GitHubLicenseApiResult>(`/repos/${owner}/${repo}/license`),
  ]);
  const branch = repository.default_branch || 'main';
  const tree = await fetchGitHubJson<GitHubTreeApiResult>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const installTargets = resolveGitHubSkillInstallPlansFromTree({
    owner,
    repo,
    branch,
    tree,
  }).map((plan) => ({
    skillPath: plan.skillPath,
    fileCount: plan.files.length,
    totalBytes: plan.totalBytes,
  }));
  return [
    normalizeRepositorySkill({
      fullName: repository.full_name || `${owner}/${repo}`,
      name: repository.name || repo,
      description: repository.description,
      repositoryUrl: repository.html_url || `https://github.com/${owner}/${repo}`,
      stars: repository.stargazers_count,
      license: license.license?.spdx_id || 'NOASSERTION',
      installTargets,
    }),
  ];
}

function isSafeGitHubTreePath(value: string): boolean {
  return Boolean(value)
    && !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function getSkillRootFromManifestPath(manifestPath: string): string {
  return manifestPath === 'SKILL.md' ? '' : posixPath.dirname(manifestPath);
}

function getRelativeInstallPath(sourcePath: string, skillPath: string): string {
  return skillPath ? posixPath.relative(skillPath, sourcePath) : sourcePath;
}

function scoreSkillManifestPath(manifestPath: string): number {
  if (manifestPath === 'SKILL.md') return 0;
  if (manifestPath.startsWith('skills/')) return 1;
  return 2;
}

function resolveGitHubSkillInstallPlanForManifest(input: {
  owner: string;
  repo: string;
  branch: string;
  tree: GitHubTreeApiResult;
  manifestPath: string;
}): GitHubMarketplaceInstallPlan {
  const blobs = (input.tree.tree || [])
    .filter((entry): entry is { path: string; type: string; size?: number } => (
      entry.type === 'blob'
      && typeof entry.path === 'string'
      && isSafeGitHubTreePath(entry.path)
    ));
  const skillPath = getSkillRootFromManifestPath(input.manifestPath);
  const files = blobs
    .filter((entry) => {
      if (!skillPath) return !entry.path.includes('/');
      return entry.path === skillPath || entry.path.startsWith(`${skillPath}/`);
    })
    .map((entry) => ({
      sourcePath: entry.path,
      targetPath: getRelativeInstallPath(entry.path, skillPath),
      size: entry.size || 0,
    }))
    .filter((entry) => entry.targetPath && isSafeGitHubTreePath(entry.targetPath))
    .sort((a, b) => a.targetPath.localeCompare(b.targetPath));

  if (!files.some((entry) => entry.targetPath === 'SKILL.md')) {
    throw new Error('Selected GitHub skill directory does not contain SKILL.md');
  }
  if (files.length > GITHUB_INSTALL_MAX_FILES) {
    throw new Error('GitHub skill directory has too many files to install safely');
  }
  if (files.some((entry) => entry.size > GITHUB_INSTALL_MAX_FILE_BYTES)) {
    throw new Error('GitHub skill directory contains a file that is too large to install safely');
  }
  const totalBytes = files.reduce((total, entry) => total + entry.size, 0);
  if (totalBytes > GITHUB_INSTALL_MAX_TOTAL_BYTES) {
    throw new Error('GitHub skill directory is too large to install safely');
  }

  return {
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    skillPath,
    files,
    totalBytes,
  };
}

export function resolveGitHubSkillInstallPlansFromTree(input: {
  owner: string;
  repo: string;
  branch: string;
  tree: GitHubTreeApiResult;
}): GitHubMarketplaceInstallPlan[] {
  if (input.tree.truncated) {
    throw new Error('GitHub repository tree is too large to install safely');
  }
  const manifestPaths = (input.tree.tree || [])
    .filter((entry): entry is { path: string; type: string; size?: number } => (
      entry.type === 'blob'
      && typeof entry.path === 'string'
      && isSafeGitHubTreePath(entry.path)
      && (entry.path.endsWith('/SKILL.md') || entry.path === 'SKILL.md')
    ))
    .map((entry) => entry.path)
    .sort((a, b) => {
      const scoreDelta = scoreSkillManifestPath(a) - scoreSkillManifestPath(b);
      return scoreDelta || a.localeCompare(b);
    });

  if (manifestPaths.length === 0) {
    throw new Error('No SKILL.md manifest found in this GitHub repository');
  }

  return manifestPaths.map((manifestPath) => resolveGitHubSkillInstallPlanForManifest({
    ...input,
    manifestPath,
  }));
}

export function resolveGitHubSkillInstallPlanFromTree(input: {
  owner: string;
  repo: string;
  branch: string;
  tree: GitHubTreeApiResult;
  selectedSkillPath?: string;
}): GitHubMarketplaceInstallPlan {
  const plans = resolveGitHubSkillInstallPlansFromTree(input);
  if (!input.selectedSkillPath) return plans[0];
  const selected = plans.find((plan) => plan.skillPath === input.selectedSkillPath);
  if (!selected) {
    throw new Error('Selected GitHub skill directory was not found in this repository');
  }
  return selected;
}

export async function discoverGitHubMarketplaceInstallPlan(
  repositoryUrl: string,
  selectedSkillPath?: string,
): Promise<GitHubMarketplaceInstallPlan> {
  const { owner, repo } = parseGitHubRepositoryUrl(repositoryUrl);
  const repository = await fetchGitHubJson<GitHubRepositoryApiResult>(`/repos/${owner}/${repo}`);
  const branch = repository.default_branch || 'main';
  const tree = await fetchGitHubJson<GitHubTreeApiResult>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  return resolveGitHubSkillInstallPlanFromTree({
    owner,
    repo,
    branch,
    tree,
    selectedSkillPath,
  });
}

export async function installGitHubMarketplaceSkill(skill: SkillMarketplaceItem): Promise<string> {
  if (skill.importSource !== 'github') {
    throw new Error('Only GitHub marketplace skills can be installed by the GitHub installer');
  }
  if (!skill.repositoryUrl) {
    throw new Error('GitHub repository URL is missing');
  }
  const plan = await discoverGitHubMarketplaceInstallPlan(skill.repositoryUrl, skill.selectedInstallTarget);
  const installDir = path.join(getOpenClawSkillsDir(), skill.id);
  const stagingDir = `${installDir}.tmp-${Date.now()}`;
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  try {
    for (const file of plan.files) {
      const targetPath = path.join(stagingDir, file.targetPath);
      const relativeTarget = path.relative(stagingDir, targetPath);
      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        throw new Error('GitHub skill file path escapes install directory');
      }
      await mkdir(path.dirname(targetPath), { recursive: true });
      const sourceUrl = `https://raw.githubusercontent.com/${encodeURIComponent(plan.owner)}/${encodeURIComponent(plan.repo)}/${encodeURIComponent(plan.branch)}/${file.sourcePath.split('/').map(encodeURIComponent).join('/')}`;
      await writeFile(targetPath, await fetchGitHubText(sourceUrl), 'utf8');
    }

    const metadataDir = path.join(stagingDir, '.canvasland');
    await mkdir(metadataDir, { recursive: true });
    await writeFile(path.join(metadataDir, 'origin.json'), `${JSON.stringify({
      importSource: 'github',
      source: skill.source,
      repositoryUrl: skill.repositoryUrl,
      license: skill.license,
      commercialUseAllowed: skill.commercialUseAllowed,
      skillPath: plan.skillPath,
      branch: plan.branch,
      fileCount: plan.files.length,
      totalBytes: plan.totalBytes,
      installedAt: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8');

    await rm(installDir, { recursive: true, force: true });
    await mkdir(path.dirname(installDir), { recursive: true });
    await rm(installDir, { recursive: true, force: true });
    await import('node:fs/promises').then(({ rename }) => rename(stagingDir, installDir));
    return installDir;
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

export function partitionMarketplaceImportPreview(skills: SkillMarketplaceItem[]): {
  skills: SkillMarketplaceItem[];
  rejected: SkillMarketplaceItem[];
} {
  return {
    skills: skills.filter((skill) => skill.reviewStatus !== 'rejected'),
    rejected: skills.filter((skill) => skill.reviewStatus === 'rejected'),
  };
}
