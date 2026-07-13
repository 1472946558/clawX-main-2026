import type {
  InstalledSkillRecord,
  SkillDetectedCommand,
  SkillDetectedCommandKind,
  SkillInstallFromGithubPayload,
  SkillInstallFromLocalPayload,
  SkillInstallStatusResult,
  SkillScanResult,
} from '../../../shared/host-api/contract';
import { getOpenClawSkillsDir } from '../../utils/paths';
import {
  discoverGitHubMarketplaceInstallPlan,
  parseGitHubRepositoryUrl,
  type GitHubMarketplaceInstallPlan,
} from './marketplace-skill-service';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { access, cp, mkdir, readdir, readFile, realpath, rm, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STORE_NAME = 'skill-installations';
const STORE_RECORDS_KEY = 'records';
const STORE_SCHEMA_KEY = 'schemaVersion';
const INSTALL_METADATA_DIR = '.canvasland';
const INSTALL_METADATA_FILE = 'install.json';
const SCAN_MAX_FILES = 80;
const SCAN_MAX_FILE_BYTES = 256 * 1024;
const COMMAND_KINDS: SkillDetectedCommandKind[] = ['pip', 'npm', 'bash', 'python', 'node', 'curl', 'wget'];
const activeInstalls = new Map<string, Promise<InstalledSkillRecord>>();

type InstallRecords = Record<string, InstalledSkillRecord>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let installStore: any = null;

async function getInstallStore() {
  if (!installStore) {
    const Store = (await import('electron-store')).default;
    installStore = new Store({
      name: STORE_NAME,
      defaults: {
        [STORE_SCHEMA_KEY]: 1,
        [STORE_RECORDS_KEY]: {},
      },
    });
  }
  return installStore;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(authorization|cookie|token|api[-_ ]?key|secret|password)\s*[:=]\s*[^\s]+/gi, '$1=[redacted]')
    .replace(/(sk-[a-zA-Z0-9_-]{12,})/g, '[redacted-key]');
}

export function sanitizeSkillId(skillId: string): string {
  const normalized = skillId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(normalized)) {
    throw new Error('Invalid skillId. Use lowercase letters, numbers, and hyphens only.');
  }
  return normalized;
}

function getSkillsRoot(root?: string): string {
  const resolved = path.resolve(root || process.env.CLAWX_SKILL_INSTALL_ROOT || getOpenClawSkillsDir());
  return canonicalizePath(resolved);
}

function canonicalizePath(candidatePath: string): string {
  const resolved = path.resolve(candidatePath);
  if (existsSync(resolved)) {
    return realpathSync.native(resolved);
  }
  const parent = path.dirname(resolved);
  if (parent === resolved) {
    return resolved;
  }
  return path.join(canonicalizePath(parent), path.basename(resolved));
}

export function resolveInstallDir(skillId: string, root?: string): string {
  return path.join(getSkillsRoot(root), sanitizeSkillId(skillId));
}

export function assertInsideSkillsRoot(candidatePath: string, root?: string): void {
  const rootPath = getSkillsRoot(root);
  const resolved = canonicalizePath(candidatePath);
  const relative = path.relative(rootPath, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error('Path escapes the OpenClaw skills directory');
}

function getInstallMetadataPath(installDir: string): string {
  return path.join(installDir, INSTALL_METADATA_DIR, INSTALL_METADATA_FILE);
}

async function readRecords(): Promise<InstallRecords> {
  const store = await getInstallStore();
  const raw = store.get(STORE_RECORDS_KEY) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as InstallRecords;
}

async function writeRecords(records: InstallRecords): Promise<void> {
  const store = await getInstallStore();
  store.set(STORE_SCHEMA_KEY, 1);
  store.set(STORE_RECORDS_KEY, records);
}

async function upsertRecord(record: InstalledSkillRecord): Promise<InstalledSkillRecord> {
  const records = await readRecords();
  records[record.skillId] = record;
  await writeRecords(records);
  return record;
}

async function removeRecord(skillId: string): Promise<void> {
  const records = await readRecords();
  delete records[sanitizeSkillId(skillId)];
  await writeRecords(records);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isSafeRelativePath(value: string): boolean {
  return Boolean(value)
    && !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function detectCommandKind(line: string): SkillDetectedCommandKind | null {
  const trimmed = line.trim();
  for (const kind of COMMAND_KINDS) {
    const pattern = new RegExp(`(^|[^a-z0-9_-])${kind}([\\s:;|&>]|\$)`, 'i');
    if (pattern.test(trimmed)) return kind;
  }
  return null;
}

function parseVersionFromSkillMd(content: string): string | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const frontmatter = match?.[1] || content.slice(0, 4096);
  return frontmatter.match(/^\s*version\s*:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
}

async function collectScannableFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  const stack = [dir];
  while (stack.length > 0 && result.length < SCAN_MAX_FILES) {
    const current = stack.pop();
    if (!current) continue;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && /\.(md|txt|json|ya?ml)$/i.test(entry.name)) {
        result.push(entryPath);
      }
      if (result.length >= SCAN_MAX_FILES) break;
    }
  }
  return result;
}

async function calculateChecksum(dir: string): Promise<string> {
  const hash = createHash('sha256');
  const files = await collectScannableFiles(dir);
  for (const file of files.sort()) {
    const stats = await stat(file);
    if (stats.size > SCAN_MAX_FILE_BYTES) continue;
    hash.update(path.relative(dir, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

export async function scanSkillDir(input: { skillId?: string; dir: string }): Promise<SkillScanResult> {
  const dir = path.resolve(input.dir);
  assertInsideSkillsRoot(dir);
  if (!(await pathExists(dir))) {
    return { success: false, error: 'Skill directory does not exist', dir };
  }
  const skillRoot = await realpath(dir);
  assertInsideSkillsRoot(skillRoot);

  const detectedCommands: SkillDetectedCommand[] = [];
  const files = await collectScannableFiles(skillRoot);
  let version: string | undefined;
  for (const file of files) {
    const stats = await stat(file);
    if (stats.size > SCAN_MAX_FILE_BYTES) continue;
    const relativeFile = path.relative(skillRoot, file);
    const content = await readFile(file, 'utf8');
    if (relativeFile === 'SKILL.md') {
      version = parseVersionFromSkillMd(content);
    }
    for (const line of content.split(/\r?\n/)) {
      const kind = detectCommandKind(line);
      if (!kind) continue;
      detectedCommands.push({ kind, line: line.trim().slice(0, 240), file: relativeFile });
    }
  }

  return {
    success: true,
    skillId: input.skillId ? sanitizeSkillId(input.skillId) : undefined,
    dir: skillRoot,
    detectedCommands,
    hasSkillMd: existsSync(path.join(skillRoot, 'SKILL.md')),
    hasManifest: existsSync(path.join(skillRoot, 'manifest.json')),
    version,
  };
}

async function assertInstallTargetMayBeReplaced(installDir: string): Promise<void> {
  if (!(await pathExists(installDir))) return;
  if (!(await pathExists(getInstallMetadataPath(installDir)))) {
    throw new Error('Refusing to overwrite an existing skill directory that is not managed by Canvasland');
  }
}

function buildEmptyRecord(skillId: string, source: 'github' | 'local', installDir: string, sourceUrl?: string): InstalledSkillRecord {
  return {
    skillId,
    source,
    sourceUrl,
    installDir,
    status: 'not_installed',
    updatedAt: nowIso(),
    detectedCommands: [],
    hasSkillMd: false,
    hasManifest: false,
    checksum: '',
  };
}

async function writeInstallMetadata(installDir: string, record: InstalledSkillRecord): Promise<void> {
  const metadataDir = path.join(installDir, INSTALL_METADATA_DIR);
  await mkdir(metadataDir, { recursive: true });
  await writeFile(
    path.join(metadataDir, INSTALL_METADATA_FILE),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
}

async function fetchGitHubText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github.raw',
      'user-agent': 'canvasland-skill-install-mvp',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub skill file download failed: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function downloadGitHubPlan(plan: GitHubMarketplaceInstallPlan, stagingDir: string): Promise<void> {
  for (const file of plan.files) {
    if (!isSafeRelativePath(file.targetPath) || !isSafeRelativePath(file.sourcePath)) {
      throw new Error('GitHub skill file path is not safe');
    }
    const targetPath = path.join(stagingDir, file.targetPath);
    assertInsideSkillsRoot(targetPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const sourceUrl = `https://raw.githubusercontent.com/${encodeURIComponent(plan.owner)}/${encodeURIComponent(plan.repo)}/${encodeURIComponent(plan.branch)}/${file.sourcePath.split('/').map(encodeURIComponent).join('/')}`;
    await writeFile(targetPath, await fetchGitHubText(sourceUrl), 'utf8');
  }
}

async function finalizeInstall(input: {
  skillId: string;
  source: 'github' | 'local';
  sourceUrl?: string;
  stagingDir: string;
  installDir: string;
}): Promise<InstalledSkillRecord> {
  const scan = await scanSkillDir({ skillId: input.skillId, dir: input.stagingDir });
  if (!scan.success) {
    throw new Error(scan.error || 'Skill scan failed');
  }
  if (!scan.hasSkillMd) {
    throw new Error('Installed skill must contain SKILL.md');
  }

  const downloadedRecord = await upsertRecord({
    ...buildEmptyRecord(input.skillId, input.source, input.installDir, input.sourceUrl),
    status: 'downloaded',
    version: scan.version || 'unknown',
    detectedCommands: scan.detectedCommands || [],
    hasSkillMd: !!scan.hasSkillMd,
    hasManifest: !!scan.hasManifest,
    checksum: await calculateChecksum(input.stagingDir),
    updatedAt: nowIso(),
  });

  await assertInstallTargetMayBeReplaced(input.installDir);
  await rm(input.installDir, { recursive: true, force: true });
  await mkdir(path.dirname(input.installDir), { recursive: true });
  await rename(input.stagingDir, input.installDir);

  const installedRecord: InstalledSkillRecord = {
    ...downloadedRecord,
    status: 'installed_metadata_only',
    installDir: input.installDir,
    installedAt: nowIso(),
    updatedAt: nowIso(),
    lastError: '',
  };
  await writeInstallMetadata(input.installDir, installedRecord);
  return upsertRecord(installedRecord);
}

export async function installFromGithub(payload: SkillInstallFromGithubPayload): Promise<InstalledSkillRecord> {
  const skillId = sanitizeSkillId(payload.skillId);
  const existingTask = activeInstalls.get(skillId);
  if (existingTask) return existingTask;

  const task = (async () => {
    const { owner, repo } = parseGitHubRepositoryUrl(payload.repositoryUrl);
    const sourceUrl = `https://github.com/${owner}/${repo}`;
    const skillsRoot = getSkillsRoot();
    const installDir = resolveInstallDir(skillId, skillsRoot);
    const stagingDir = path.join(skillsRoot, '.staging', `${skillId}-${Date.now()}`);
    assertInsideSkillsRoot(installDir, skillsRoot);
    assertInsideSkillsRoot(stagingDir, skillsRoot);
    await mkdir(path.dirname(stagingDir), { recursive: true });
    await rm(stagingDir, { recursive: true, force: true });

    await upsertRecord({
      ...buildEmptyRecord(skillId, 'github', installDir, sourceUrl),
      status: 'downloading',
      updatedAt: nowIso(),
    });

    try {
      const plan = await discoverGitHubMarketplaceInstallPlan(sourceUrl, payload.selectedInstallTarget);
      await mkdir(stagingDir, { recursive: true });
      await downloadGitHubPlan(plan, stagingDir);
      return await finalizeInstall({ skillId, source: 'github', sourceUrl, stagingDir, installDir });
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true });
      const failedRecord = await upsertRecord({
        ...buildEmptyRecord(skillId, 'github', installDir, sourceUrl),
        status: 'failed',
        lastError: safeErrorMessage(error),
        updatedAt: nowIso(),
      });
      throw new Error(failedRecord.lastError || 'Skill installation failed');
    } finally {
      activeInstalls.delete(skillId);
    }
  })();

  activeInstalls.set(skillId, task);
  return task;
}

export async function installFromLocal(payload: SkillInstallFromLocalPayload): Promise<InstalledSkillRecord> {
  const skillId = sanitizeSkillId(payload.skillId);
  const skillsRoot = getSkillsRoot();
  const installDir = resolveInstallDir(skillId, skillsRoot);
  const stagingDir = path.join(skillsRoot, '.staging', `${skillId}-${Date.now()}`);
  const localDir = path.resolve(payload.localDir);
  assertInsideSkillsRoot(installDir, skillsRoot);
  assertInsideSkillsRoot(localDir, skillsRoot);
  await mkdir(path.dirname(stagingDir), { recursive: true });
  await rm(stagingDir, { recursive: true, force: true });

  try {
    await cp(localDir, stagingDir, {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.includes(`${path.sep}node_modules${path.sep}`),
    });
    return await finalizeInstall({ skillId, source: 'local', stagingDir, installDir });
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    const failedRecord = await upsertRecord({
      ...buildEmptyRecord(skillId, 'local', installDir),
      status: 'failed',
      lastError: safeErrorMessage(error),
      updatedAt: nowIso(),
    });
    throw new Error(failedRecord.lastError || 'Local skill installation failed');
  }
}

export async function getInstalledSkills(): Promise<InstalledSkillRecord[]> {
  return Object.values(await readRecords()).sort((left, right) => left.skillId.localeCompare(right.skillId));
}

export async function getInstallStatus(skillId: string): Promise<SkillInstallStatusResult> {
  const normalized = sanitizeSkillId(skillId);
  const records = await readRecords();
  const record = records[normalized];
  return {
    success: true,
    record,
    status: record?.status || 'not_installed',
  };
}

export async function uninstall(skillId: string): Promise<void> {
  const normalized = sanitizeSkillId(skillId);
  const installDir = resolveInstallDir(normalized);
  assertInsideSkillsRoot(installDir);
  const metadataPath = getInstallMetadataPath(installDir);
  if (!(await pathExists(metadataPath))) {
    throw new Error('Refusing to uninstall a skill directory that is not managed by Canvasland');
  }
  await rm(installDir, { recursive: true, force: true });
  await removeRecord(normalized);
}

export const skillInstallInternalsForTests = {
  getInstallMetadataPath,
  safeErrorMessage,
};
