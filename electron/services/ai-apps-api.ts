import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { getDataDir } from '../utils/paths';
import { isRecord } from './payload-utils';
import type {
  AiAppCreateJobPayload,
  AiAppJob,
  AiAppJobMode,
  AiAppJobOutputs,
  AiAppListResultsPayload,
  JsonRecord,
} from '../../shared/host-api/contract';
import { buildPlatformRulePrompt, resolveEcommercePlatformRule } from '../../shared/ecommerce/platform-rules';
import { getAiWorkflowDefinition, listAiWorkflowDefinitions } from '../../shared/ai-workflows';
import type { ProviderAccount } from '../shared/providers/types';
import { getProviderService } from './providers/provider-service';
import { getProviderApiKeyFromOpenClaw } from '../utils/openclaw-auth';
import { resolveOpenClawProviderKey } from '../utils/provider-keys';
import { getProviderConfig } from '../utils/provider-registry';
import { fetchOpenAiCompatibleModels } from './providers/provider-validation';
import { proxyAwareFetch } from '../utils/proxy-fetch';

type AiAppRunnerInput = {
  jobId: string;
  appId: string;
  inputs: JsonRecord;
};

export type AiAppRunner = {
  run: (input: AiAppRunnerInput) => Promise<AiAppJobOutputs>;
};

type AiAppBillingQuote = {
  points: number;
  affordable: boolean;
  availablePoints: number;
};

export type AiAppBillingClient = {
  quote: (workflowId: string, billingTierId: string) => Promise<AiAppBillingQuote>;
  debit: (workflowId: string, billingTierId: string, requestId: string) => Promise<number>;
};

const jobs = new Map<string, AiAppJob>();
const CANVASLAND_NEWAPI_BASE_URL = 'https://feiniu.space/v1';
const CANVASLAND_NEWAPI_AUTH_PROVIDERS = ['custom-canvasla', 'clawx-openai-image'];
const CANVASLAND_IMAGE_MODEL = 'image-01';
const DEFAULT_VIDEO_MODEL = 'seedance-2.0-720p';
const VIDEO_GENERATION_ENDPOINTS = ['/video/generations', '/videos'];
const IMAGE_TO_IMAGE_MODELS = new Set(['image-01', 'image-01-live']);
const REFERENCE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const REFERENCE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const STAGED_FILES_DIR = join(homedir(), '.openclaw', 'media', 'outbound');
const CANVASLAND_WALLET_API_BASE_URL = 'https://apitoken.unihuax.com';

type StagedReferenceImage = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  stagedPath: string;
};
const VIDEO_MODEL_PATTERN = /(video|seedance|kling|veo|sora|wan[-_.]?\d|hunyuan|minimax.*video|vidu|cogvideo|ltx)/i;
const videoModelCache = new Map<string, { expiresAt: number; models: string[] }>();

type VideoProviderContext = {
  account: ProviderAccount;
  apiKey: string;
  baseUrl: string;
  models: string[];
};

type VideoTaskCreation = {
  providerId: string;
  providerLabel: string;
  providerTaskId?: string;
  status: AiAppJob['status'];
  rawResponseSummary: string;
  resultUrl?: string;
  endpoint?: string;
};

export type AiAppVideoTaskClient = {
  capabilities: () => Promise<{
    supported: boolean;
    providerId?: string;
    providerLabel?: string;
    models: string[];
    reason?: string;
  }>;
  create: (inputs: JsonRecord) => Promise<VideoTaskCreation>;
  refresh: (job: AiAppJob) => Promise<VideoTaskCreation>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeMode(value: unknown): AiAppJobMode {
  if (value === undefined || value === 'live') return 'live';
  throw new Error('mode must be live');
}

function normalizeAppId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('appId is required');
  }
  const appId = value.trim();
  if (!getAiWorkflowDefinition(appId)) {
    throw new Error(`Unknown AI workflow: ${appId}`);
  }
  return appId;
}

function normalizeJobId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('id is required');
  }
  return value.trim();
}

function normalizeInputs(value: unknown): JsonRecord {
  return isRecord(value) ? { ...value } : {};
}

function createJobId(appId: string): string {
  return `aiapp-${appId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stringInput(inputs: JsonRecord, key: string, fallback = ''): string {
  const value = inputs[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function billingTierForWorkflow(appId: string, inputs: JsonRecord): string {
  const workflow = getAiWorkflowDefinition(appId);
  if (!workflow) throw new Error(`Unknown AI workflow: ${appId}`);
  const billingTierId = stringInput(inputs, 'billingTierId', workflow.defaultBillingTierId);
  if (!workflow.billingTiers.some((tier) => tier.id === billingTierId)) {
    throw new Error('Unsupported AI workflow billing tier');
  }
  return billingTierId;
}

async function walletBillingRequest(path: string, payload: JsonRecord): Promise<JsonRecord> {
  const response = await proxyAwareFetch(`${CANVASLAND_WALLET_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const record = isRecord(data) ? data : {};
  if (!response.ok || record.success !== true) {
    const message = typeof record.error === 'string' ? record.error : `Wallet billing failed (${response.status})`;
    throw new Error(safeApiMessage(message));
  }
  return record;
}

class ServerAiAppBillingClient implements AiAppBillingClient {
  async quote(workflowId: string, billingTierId: string): Promise<AiAppBillingQuote> {
    const result = await walletBillingRequest('/api/usage/quote', { workflowId, billingTierId });
    return {
      points: Number(result.points) || 0,
      affordable: result.affordable === true,
      availablePoints: Number(result.availablePoints) || 0,
    };
  }

  async debit(workflowId: string, billingTierId: string, requestId: string): Promise<number> {
    const result = await walletBillingRequest('/api/usage/debit', { workflowId, billingTierId, requestId });
    return Number(result.pointsUsed) || 0;
  }
}

class AcceptanceAiAppBillingClient implements AiAppBillingClient {
  async quote(workflowId: string, billingTierId: string): Promise<AiAppBillingQuote> {
    const workflow = getAiWorkflowDefinition(workflowId);
    const tier = workflow?.billingTiers.find((candidate) => candidate.id === billingTierId);
    if (!tier) throw new Error('Unsupported AI workflow billing tier');
    return { points: tier.points, affordable: true, availablePoints: 100_000 };
  }

  async debit(workflowId: string, billingTierId: string): Promise<number> {
    return (await this.quote(workflowId, billingTierId)).points;
  }
}

async function assertAffordable(billing: AiAppBillingClient, workflowId: string, billingTierId: string): Promise<void> {
  const quote = await billing.quote(workflowId, billingTierId);
  if (!quote.affordable) {
    throw new Error(`积分不足：本次需要 ${quote.points} 积分，当前可用 ${quote.availablePoints} 积分。`);
  }
}

function referenceImagesInput(inputs: JsonRecord): StagedReferenceImage[] {
  const value = inputs.referenceImages;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const { id, fileName, mimeType, fileSize, stagedPath } = entry;
    if (
      typeof id !== 'string'
      || typeof fileName !== 'string'
      || typeof mimeType !== 'string'
      || typeof fileSize !== 'number'
      || typeof stagedPath !== 'string'
    ) return [];
    return [{ id, fileName, mimeType, fileSize, stagedPath }];
  });
}

function assertInsideStagedFiles(filePath: string): void {
  const rel = relative(resolve(STAGED_FILES_DIR), resolve(filePath));
  if (rel.startsWith('..') || rel === '' || rel.includes('\0')) {
    throw new Error('Invalid staged reference image path');
  }
}

async function stagedReferenceDataUrl(reference: StagedReferenceImage): Promise<string> {
  assertInsideStagedFiles(reference.stagedPath);
  if (!REFERENCE_IMAGE_MIME_TYPES.has(reference.mimeType) || !REFERENCE_IMAGE_EXTENSIONS.has(extname(reference.stagedPath).toLowerCase())) {
    throw new Error(`Unsupported reference image format: ${reference.fileName}`);
  }
  if (reference.fileSize <= 0 || reference.fileSize > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error(`Reference image must be smaller than 10 MB: ${reference.fileName}`);
  }
  const data = await readFile(reference.stagedPath);
  if (data.length !== reference.fileSize || data.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error(`Staged reference image metadata mismatch: ${reference.fileName}`);
  }
  return `data:${reference.mimeType};base64,${data.toString('base64')}`;
}

function safeApiMessage(value: string, secrets: string[] = []): string {
  return secrets
    .filter(Boolean)
    .reduce((message, secret) => message.split(secret).join('[redacted]'), value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 600);
}

type TextProviderConfig = {
  account: ProviderAccount;
  apiKey: string;
  endpoint: string;
  model: string;
};

export function normalizeChatCompletionsEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('当前 Provider 缺少 Base URL，请先在设置中完善 Provider 配置。');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('当前 Provider 的 Base URL 无效，请先在设置中修正。');
  }

  const versionedPath = /\/(?:api\/)?v\d+(?:\.\d+)?$/i.test(parsed.pathname.replace(/\/+$/, ''));
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}${versionedPath ? '' : '/v1'}/chat/completions`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeSelectedModel(model: string, runtimeProviderKey: string): string {
  const trimmed = model.trim();
  const prefix = `${runtimeProviderKey}/`;
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
}

async function resolveCurrentTextProvider(): Promise<TextProviderConfig> {
  const providerService = getProviderService();
  const defaultAccountId = await providerService.getDefaultAccountId();
  if (!defaultAccountId) {
    throw new Error('Provider 未配置，请先在设置中配置并设为默认 Provider。');
  }

  const accounts = await providerService.listAccounts();
  const account = accounts.find((candidate) => candidate.id === defaultAccountId)
    ?? await providerService.getAccount(defaultAccountId);
  if (!account || !account.enabled) {
    throw new Error('Provider 未配置，请先在设置中配置并启用默认 Provider。');
  }

  const runtimeProviderKey = resolveOpenClawProviderKey(account);
  const apiKey = (await getProviderApiKeyFromOpenClaw(runtimeProviderKey))
    ?? (await providerService.getAccountApiKey(account.id));
  if (!apiKey?.trim()) {
    throw new Error('Provider 未配置 API Key，请先在设置中完成 Provider 配置。');
  }

  const baseUrl = account.baseUrl || getProviderConfig(account.vendorId)?.baseUrl;
  const selectedModel = account.model ? normalizeSelectedModel(account.model, runtimeProviderKey) : '';
  if (!selectedModel) {
    throw new Error('当前 Provider 未选择模型，请先在设置中选择 Model。');
  }

  return {
    account,
    apiKey: apiKey.trim(),
    endpoint: normalizeChatCompletionsEndpoint(baseUrl || ''),
    model: selectedModel,
  };
}

function rawResponseSummary(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return safeApiMessage(serialized || 'Empty provider response').slice(0, 1200);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function videoModelsForAccount(account: ProviderAccount): string[] {
  return uniqueStrings([
    ...(account.metadata?.customModels || []),
    account.model,
    ...(account.fallbackModels || []),
  ]).filter((model) => VIDEO_MODEL_PATTERN.test(model));
}

async function discoverVideoModels(account: ProviderAccount, apiKey: string): Promise<string[]> {
  const cached = videoModelCache.get(account.id);
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  const configured = videoModelsForAccount(account);
  let remote: string[] = [];
  const baseUrl = account.baseUrl || getProviderConfig(account.vendorId)?.baseUrl;
  if (baseUrl) {
    const result = await Promise.race([
      fetchOpenAiCompatibleModels(baseUrl, apiKey),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]);
    if (result?.success) remote = result.models.filter((model) => VIDEO_MODEL_PATTERN.test(model));
  }
  const models = uniqueStrings([...remote, ...configured]);
  if (models.length === 0 && isCanvaslandVideoProvider(account)) models.push(DEFAULT_VIDEO_MODEL);
  videoModelCache.set(account.id, { expiresAt: Date.now() + 60_000, models });
  return models;
}

function isCanvaslandVideoProvider(account: ProviderAccount): boolean {
  const fingerprint = `${account.id} ${account.label} ${account.baseUrl || ''}`.toLowerCase();
  return fingerprint.includes('feiniu') || fingerprint.includes('canvasla');
}

async function resolveCurrentVideoProvider(): Promise<VideoProviderContext> {
  const service = getProviderService();
  const accounts = (await service.listAccounts()).filter((account) => account.enabled);
  const defaultId = await service.getDefaultAccountId();
  const account = defaultId ? accounts.find((candidate) => candidate.id === defaultId) : undefined;
  if (!account) {
    throw new Error('No current default AI Provider is configured. Select a video-capable default Provider in Settings first.');
  }

  const baseUrl = account.baseUrl || getProviderConfig(account.vendorId)?.baseUrl;
  if (!baseUrl?.trim()) {
    throw new Error(`Current Provider “${account.label}” has no Base URL for video generation.`);
  }

  const runtimeKey = resolveOpenClawProviderKey(account);
  const apiKey = (await getProviderApiKeyFromOpenClaw(runtimeKey))
    || (await service.getAccountApiKey(account.id));
  if (!apiKey) {
    throw new Error(`Current Provider “${account.label}” has no usable API key.`);
  }
  const models = await discoverVideoModels(account, apiKey);
  if (models.length === 0) {
    throw new Error(`Current Provider “${account.label}” does not declare a video-generation model.`);
  }
  return { account, apiKey, baseUrl: baseUrl.replace(/\/+$/, ''), models };
}

function providerErrorMessage(response: JsonRecord): string | null {
  const item = extractGeneratedItem(response);
  for (const candidate of [item.error, response.error]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (isRecord(candidate) && typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message.trim();
  }
  for (const candidate of [item.message, response.message, item.reason, response.reason]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function normalizeProviderStatus(response: JsonRecord, resultUrl?: string): AiAppJob['status'] {
  if (resultUrl) return 'completed';
  const item = extractGeneratedItem(response);
  const raw = String(item.status || item.state || response.status || response.state || '').toLowerCase();
  if (['completed', 'complete', 'succeeded', 'success', 'done', 'finished'].includes(raw)) return 'completed';
  if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'rejected'].includes(raw)) return 'failed';
  if (['running', 'processing', 'in_progress', 'in-progress', 'generating'].includes(raw)) return 'running';
  return 'queued';
}

function sizeForRatio(ratio: string): string {
  switch (ratio) {
    case '2:3':
      return '768x1152';
    case '3:4':
      return '768x1024';
    case '4:3':
      return '1024x768';
    case '16:9':
      return '1280x720';
    case '9:16':
      return '720x1280';
    default:
      return '1024x1024';
  }
}

async function readCanvaslandNewApiKey(): Promise<string> {
  const envKey = process.env.CANVASLAND_NEWAPI_KEY || process.env.OPENAI_API_KEY;
  if (envKey?.trim()) return envKey.trim();

  const profilePath = join(homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
  const raw = await readFile(profilePath, 'utf-8');
  const parsed = JSON.parse(raw) as { profiles?: Record<string, unknown> };
  for (const provider of CANVASLAND_NEWAPI_AUTH_PROVIDERS) {
    for (const profile of Object.values(parsed.profiles || {})) {
      if (!isRecord(profile) || profile.provider !== provider) continue;
      const key = profile.key;
      if (typeof key === 'string' && key.trim()) return key.trim();
    }
  }
  throw new Error('Canvasland NewAPI key is not configured');
}

async function fetchNewApiJson(path: string, payload: JsonRecord, timeoutMs = 180_000): Promise<JsonRecord> {
  const key = await readCanvaslandNewApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${CANVASLAND_NEWAPI_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    const json = (() => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    })();
    if (!response.ok) {
      const message = isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string'
        ? json.error.message
        : isRecord(json) && typeof json.message === 'string'
          ? json.message
          : text;
      throw new Error(`Feiniu API ${path} failed (${response.status}): ${safeApiMessage(message)}`);
    }
    if (!isRecord(json)) {
      throw new Error(`Feiniu API ${path} returned an invalid JSON response`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNewApiAsset(url: string, timeoutMs = 180_000): Promise<Buffer> {
  if (url.startsWith('data:')) {
    const [, payload = ''] = url.split(',', 2);
    return Buffer.from(payload, 'base64');
  }

  const key = await readCanvaslandNewApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Feiniu asset download failed (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

function extractGeneratedItem(response: JsonRecord): JsonRecord {
  const data = response.data;
  if (Array.isArray(data) && isRecord(data[0])) return data[0];
  if (isRecord(data)) return data;
  return response;
}

function extractGeneratedUrl(response: JsonRecord): string | null {
  const item = extractGeneratedItem(response);
  const imageUrls = item.image_urls;
  if (Array.isArray(imageUrls)) {
    const url = imageUrls.find((entry) => typeof entry === 'string' && entry.trim());
    if (typeof url === 'string') return url.trim();
  }
  for (const key of ['url', 'video_url', 'image_url', 'download_url', 'output_url']) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const output = item.output;
  if (Array.isArray(output)) {
    const url = output.find((entry) => typeof entry === 'string' && entry.trim());
    if (typeof url === 'string') return url.trim();
  }
  for (const nested of [item.output, item.result, item.content, response.result]) {
    if (!isRecord(nested)) continue;
    for (const key of ['url', 'video_url', 'download_url', 'output_url']) {
      const value = nested[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

function extractGeneratedId(response: JsonRecord): string | null {
  const item = extractGeneratedItem(response);
  for (const key of ['id', 'task_id', 'taskId', 'request_id']) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

async function writeImageGeneration(response: JsonRecord, outputPath: string): Promise<void> {
  const item = extractGeneratedItem(response);
  const imageBase64 = item.image_base64;
  if (Array.isArray(imageBase64) && typeof imageBase64[0] === 'string' && imageBase64[0].trim()) {
    await writeFile(outputPath, Buffer.from(imageBase64[0], 'base64'));
    return;
  }
  const b64 = item.b64_json;
  if (typeof b64 === 'string' && b64.trim()) {
    const payload = b64.includes(',') ? b64.split(',').pop() || '' : b64;
    await writeFile(outputPath, Buffer.from(payload, 'base64'));
    return;
  }
  const url = extractGeneratedUrl(response);
  if (url) {
    await writeFile(outputPath, await fetchNewApiAsset(url));
    return;
  }
  throw new Error('Feiniu image generation completed without a downloadable image');
}

async function parseProviderResponse(response: Response, action: string): Promise<JsonRecord> {
  const text = await response.text();
  const parsed = (() => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  })();
  if (!response.ok) {
    const message = isRecord(parsed) ? providerErrorMessage(parsed) || text : text;
    throw new Error(`${action} failed (${response.status}): ${safeApiMessage(message || response.statusText)}`);
  }
  if (!isRecord(parsed)) throw new Error(`${action} returned invalid JSON: ${safeApiMessage(text)}`);
  return parsed;
}

function providerHeaders(context: VideoProviderContext): Record<string, string> {
  return {
    ...context.account.headers,
    authorization: `Bearer ${context.apiKey}`,
    'content-type': 'application/json',
  };
}

async function createProviderVideoTask(context: VideoProviderContext, inputs: JsonRecord): Promise<VideoTaskCreation> {
  const productText = stringInput(inputs, 'productText');
  if (!productText) throw new Error('Product text is required for video generation.');
  const model = stringInput(inputs, 'videoModel', context.models[0] || DEFAULT_VIDEO_MODEL);
  if (!context.models.includes(model)) {
    throw new Error(`Video model “${model}” is not available on current Provider “${context.account.label}”.`);
  }
  const platformRule = resolveEcommercePlatformRule(inputs.platform);
  const billingTierId = stringInput(inputs, 'billingTierId', 'basic');
  const videoProfile = billingTierId === 'master'
    ? { duration: 10, resolution: '1080p', instruction: '大师级画质、精细光影、最高细节、无水印成片。' }
    : billingTierId === 'pro'
      ? { duration: 10, resolution: '1080p', instruction: '高清商用画质、稳定镜头、无水印成片。' }
      : { duration: 5, resolution: '720p', instruction: '清晰直接的基础商用短视频。' };
  const prompt = [
    `商品文本：${productText}`,
    `核心卖点：${stringInput(inputs, 'sellingPoints', '未提供')}`,
    buildPlatformRulePrompt(platformRule),
    `画面比例：${stringInput(inputs, 'ratio', '9:16')}`,
    `档位要求：${videoProfile.instruction}`,
    '生成可直接用于电商投放的商品短视频，突出真实商品卖点，并遵守目标平台合规规则。',
  ].join('\n');
  const payload: JsonRecord = {
    model,
    prompt,
    duration: videoProfile.duration,
    size: sizeForRatio(stringInput(inputs, 'ratio', '9:16')),
    ratio: stringInput(inputs, 'ratio', '9:16'),
    resolution: videoProfile.resolution,
  };

  let lastError: Error | null = null;
  for (const endpoint of VIDEO_GENERATION_ENDPOINTS) {
    try {
      const response = await fetch(`${context.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: providerHeaders(context),
        body: JSON.stringify(payload),
      });
      const json = await parseProviderResponse(response, `${context.account.label} video creation`);
      const resultUrl = extractGeneratedUrl(json) || undefined;
      const status = normalizeProviderStatus(json, resultUrl);
      const error = providerErrorMessage(json);
      if (status === 'failed') throw new Error(error || rawResponseSummary(json));
      const providerTaskId = extractGeneratedId(json) || undefined;
      if (!providerTaskId && !resultUrl) {
        throw new Error(`Provider returned neither a taskId nor a video URL: ${rawResponseSummary(json)}`);
      }
      return {
        providerId: context.account.id,
        providerLabel: context.account.label,
        providerTaskId,
        status,
        rawResponseSummary: rawResponseSummary(json),
        resultUrl,
        endpoint,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!/\((404|405)\)/.test(lastError.message)) break;
    }
  }
  throw lastError || new Error(`${context.account.label} video creation failed.`);
}

async function refreshProviderVideoTask(context: VideoProviderContext, job: AiAppJob): Promise<VideoTaskCreation> {
  if (!job.providerTaskId) throw new Error('Provider taskId is missing; this task cannot be queried.');
  const id = encodeURIComponent(job.providerTaskId);
  const endpoint = typeof job.inputs.providerEndpoint === 'string' ? job.inputs.providerEndpoint : VIDEO_GENERATION_ENDPOINTS[0];
  const candidates = [
    `${context.baseUrl}${endpoint}/${id}`,
    `${context.baseUrl}${endpoint}?id=${id}`,
    `${context.baseUrl}/tasks/${id}`,
  ];
  let lastError: Error | null = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers: providerHeaders(context) });
      if (response.status === 404 || response.status === 405) continue;
      const json = await parseProviderResponse(response, `${context.account.label} video status query`);
      const resultUrl = extractGeneratedUrl(json) || undefined;
      const status = normalizeProviderStatus(json, resultUrl);
      const error = providerErrorMessage(json);
      if (status === 'failed') throw new Error(error || rawResponseSummary(json));
      if (status === 'completed' && !resultUrl) {
        throw new Error(`Provider reported completion without a video URL: ${rawResponseSummary(json)}`);
      }
      return {
        providerId: context.account.id,
        providerLabel: context.account.label,
        providerTaskId: job.providerTaskId,
        status,
        rawResponseSummary: rawResponseSummary(json),
        resultUrl,
        endpoint,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!/\((404|405)\)/.test(lastError.message)) break;
    }
  }
  throw lastError || new Error(`Current Provider “${context.account.label}” does not expose a compatible video task status endpoint.`);
}

async function createNewApiImage(
  prompt: string,
  ratio: string,
  outputPath: string,
  model: string,
  billingTierId: string,
  referenceImage?: string,
): Promise<JsonRecord> {
  const response = await fetchNewApiJson('/images/generations', {
    model,
    prompt,
    size: sizeForRatio(ratio),
    aspect_ratio: ratio,
    quality: billingTierId === 'pro' ? 'high' : 'standard',
    n: 1,
    ...(referenceImage ? {
      subject_reference: [{ type: 'character', image_file: referenceImage }],
    } : {}),
  }, 300_000);
  await writeImageGeneration(response, outputPath);
  return response;
}

function extractChatCompletionText(response: JsonRecord): string {
  const choices = response.choices;
  if (!Array.isArray(choices) || !isRecord(choices[0])) {
    throw new Error('Provider 返回成功，但响应中没有 choices。');
  }
  const message = choices[0].message;
  if (isRecord(message) && typeof message.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }
  const text = choices[0].text;
  if (typeof text === 'string' && text.trim()) {
    return text.trim();
  }
  throw new Error('Provider 返回成功，但响应中没有可显示的文案。');
}

async function createProviderText(prompt: string, jobId: string, billingTierId: string): Promise<string> {
  const provider = await resolveCurrentTextProvider();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const customHeaders = Object.fromEntries(
      Object.entries(provider.account.headers || {}).filter(([key]) => !['authorization', 'content-type'].includes(key.toLowerCase())),
    );
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        ...customHeaders,
        authorization: `Bearer ${provider.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: 'system',
            content: '你是专业电商运营文案助手。根据用户提供的真实商品信息输出可直接使用、结构清晰、符合目标平台规则的中文文案；不要虚构未提供的产品参数或认证。',
          },
          { role: 'user', content: prompt },
        ],
        stream: false,
        metadata: {
          workflowId: 'ecommerce-copywriting',
          billingTierId,
          requestId: jobId,
        },
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    const json = (() => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    })();
    if (!response.ok) {
      const message = isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string'
        ? json.error.message
        : isRecord(json) && typeof json.message === 'string'
          ? json.message
          : text || response.statusText;
      throw new Error(`Provider 请求失败 (${response.status}): ${safeApiMessage(message, [provider.apiKey])}`);
    }
    if (!isRecord(json)) {
      throw new Error('Provider 返回了无效的 JSON 响应。');
    }
    return extractChatCompletionText(json);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Provider 请求超时，请稍后重试。', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildCommercialPrompt(appId: string, inputs: JsonRecord): string {
  const workflow = getAiWorkflowDefinition(appId);
  if (!workflow) throw new Error(`Unknown AI workflow: ${appId}`);
  const platformRule = resolveEcommercePlatformRule(inputs.platform);
  const ratio = stringInput(inputs, 'ratio', '1:1');
  const appTitle = stringInput(inputs, 'appTitle', appId);
  const userPrompt = stringInput(inputs, 'prompt');
  const platformLine = buildPlatformRulePrompt(platformRule);
  const common = `${platformLine}\n应用：${appTitle}\n画面比例：${ratio}${userPrompt ? `\n用户要求：${userPrompt}` : ''}\n请输出可直接用于电商运营的正式商用内容，且必须在输出末尾列出平台合规检查结果。`;

  if (appId === 'ecommerce-copywriting') {
    const productName = stringInput(inputs, 'productName');
    const sellingPoints = stringInput(inputs, 'sellingPoints');
    const brandTone = stringInput(inputs, 'brandTone', '专业、可信、自然');
    const targetAudience = stringInput(inputs, 'targetAudience', '未指定');
    const useScene = stringInput(inputs, 'useScene', '未指定');
    if (!productName || !sellingPoints) {
      throw new Error('产品名称和核心卖点为必填项。');
    }
    const tierInstruction = {
      short: '档位：短文案。控制在 150 字以内，输出精炼标题和短句，避免冗余。',
      social: '档位：社媒增强。输出多版本标题、社媒正文和行动号召，控制在 300-500 字。',
      long: '档位：长篇商用。输出结构完整的详情页长文案，控制在 800-1200 字。',
      deep: '档位：深度策略。先给受众洞察与内容策略，再输出 1500-2500 字高完成度商用文案。',
    }[stringInput(inputs, 'billingTierId', 'social')] || '';
    return `${common}
产品名称：${productName}
核心卖点：${sellingPoints}
品牌语气：${brandTone}
目标人群：${targetAudience}
使用场景：${useScene}
${tierInstruction}
任务：生成 3 个商品标题、5 条卖点文案、1 段详情页文案和 1 条短视频脚本钩子。按“商品标题 / 核心卖点 / 详情页文案 / 视频钩子 / 合规检查”分段输出。`;
  }
  if (appId === 'detail-poster-generator') {
    return `${common}\n任务：生成商品详情图/详情海报方案。请描述版式、主视觉、卖点模块、详情页顺序、图片提示词和合规注意事项。`;
  }
  if (appId === 'product-short-video') {
    return `${common}\n任务：生成商品短视频方案。请给出 6-12 秒脚本、镜头分镜、封面帧提示词、字幕文案和合规注意事项。`;
  }
  return `${common}\n任务：生成电商 AI 应用输出方案。`;
}

function createAcceptedOutputs(appId: string, jobId: string, source: 'openclaw' | 'acceptance' | 'provider' | 'feiniu', resultText: string, outputPath?: string): AiAppJobOutputs {
  const metadata = {
    quality: source,
    ...(resultText ? { resultText: resultText.slice(0, 4000) } : {}),
  };

  if (appId === 'ecommerce-copywriting') {
    const assets = [
      { type: 'text' as const, title: 'Product title candidates', titleKey: 'productTitleCandidates', descriptionKey: 'productTitleCandidates', ratio: 'copy' },
      { type: 'text' as const, title: 'Selling point bullets', titleKey: 'sellingPointBullets', descriptionKey: 'sellingPointBullets', ratio: 'copy' },
      { type: 'text' as const, title: 'Detail page copy block', titleKey: 'detailPageCopyBlock', descriptionKey: 'detailPageCopyBlock', ratio: 'copy' },
    ].map((asset, index) => ({
      id: `${jobId}-asset-${index + 1}`,
      type: asset.type,
      title: asset.title,
      titleKey: asset.titleKey,
      descriptionKey: asset.descriptionKey,
      downloadUrl: outputPath,
      metadata: { ...metadata, ratio: asset.ratio },
    }));
    return { assetCount: assets.length, assets };
  }

  if (appId === 'product-short-video') {
    const assets = [
      { type: 'text' as const, title: 'Video script hook', titleKey: 'videoScriptHook', descriptionKey: 'videoScriptHook', ratio: 'script' },
      { type: 'video' as const, title: 'Product video storyboard', titleKey: 'productVideoStoryboard', descriptionKey: 'productVideoStoryboard', ratio: '16:9' },
      { type: 'image' as const, title: 'Video cover frame', titleKey: 'videoCoverFrame', descriptionKey: 'videoCoverFrame', ratio: '9:16' },
    ].map((asset, index) => ({
      id: `${jobId}-asset-${index + 1}`,
      type: asset.type,
      title: asset.title,
      titleKey: asset.titleKey,
      descriptionKey: asset.descriptionKey,
      downloadUrl: outputPath,
      metadata: { ...metadata, ratio: asset.ratio },
    }));
    return { assetCount: assets.length, assets };
  }

  const assets = [
    { type: 'image' as const, title: 'Detail image section', titleKey: 'detailImageSection', descriptionKey: 'detailImageSection', ratio: '4:3' },
    { type: 'poster' as const, title: 'Long detail poster', titleKey: 'longDetailPoster', descriptionKey: 'longDetailPoster', ratio: '3:4' },
    { type: 'image' as const, title: 'Main image variation', titleKey: 'mainImageVariation', descriptionKey: 'mainImageVariation', ratio: '1:1' },
  ].map((asset, index) => ({
    id: `${jobId}-asset-${index + 1}`,
    type: asset.type,
    title: asset.title,
    titleKey: asset.titleKey,
    descriptionKey: asset.descriptionKey,
    downloadUrl: outputPath,
    metadata: { ...metadata, ratio: asset.ratio },
  }));
  return { assetCount: assets.length, assets };
}

class FeiniuAiAppRunner implements AiAppRunner {
  async run(input: AiAppRunnerInput): Promise<AiAppJobOutputs> {
    const prompt = buildCommercialPrompt(input.appId, input.inputs);
    const outputDir = join(getDataDir(), 'ai-app-results', input.jobId);
    await mkdir(outputDir, { recursive: true });

    if (input.appId === 'ecommerce-copywriting') {
      // Copy generation is intentionally independent from an optional skill manifest.
      // Missing ecommerce-copywriting skill files must never block the configured Provider call.
      const result = await createProviderText(prompt, input.jobId, stringInput(input.inputs, 'billingTierId', 'social'));
      const outputPath = join(outputDir, 'copywriting-output.txt');
      await writeFile(outputPath, result, 'utf-8');
      return createAcceptedOutputs(input.appId, input.jobId, 'provider', result, outputPath);
    }

    if (input.appId === 'product-short-video') throw new Error('Product video generation must use the current Provider task API.');

    const outputPath = join(outputDir, 'detail-image.png');
    const model = stringInput(input.inputs, 'model', CANVASLAND_IMAGE_MODEL);
    const references = referenceImagesInput(input.inputs);
    if (references.length > 0 && !IMAGE_TO_IMAGE_MODELS.has(model)) {
      throw new Error('当前模型不支持参考图生成');
    }
    const referenceImage = references[0] ? await stagedReferenceDataUrl(references[0]) : undefined;
    const response = await createNewApiImage(
      prompt,
      stringInput(input.inputs, 'ratio', '1:1'),
      outputPath,
      model,
      stringInput(input.inputs, 'billingTierId', 'standard'),
      referenceImage,
    );
    return createAcceptedOutputs(input.appId, input.jobId, 'feiniu', JSON.stringify(response, null, 2), outputPath);
  }
}

class AcceptanceAiAppRunner implements AiAppRunner {
  async run(input: AiAppRunnerInput): Promise<AiAppJobOutputs> {
    if (input.appId !== 'detail-poster-generator') {
      return createAcceptedOutputs(input.appId, input.jobId, 'acceptance', 'Acceptance runner output');
    }
    const outputDir = join(getDataDir(), 'ai-app-results', input.jobId);
    const outputPath = join(outputDir, 'detail-image.webp');
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, await readFile(join(process.cwd(), 'src/assets/ai-apps/detail-poster.webp')));
    return createAcceptedOutputs(input.appId, input.jobId, 'acceptance', 'Acceptance runner output', outputPath);
  }
}

class ProviderVideoTaskClient implements AiAppVideoTaskClient {
  async capabilities() {
    try {
      const context = await resolveCurrentVideoProvider();
      return {
        supported: true,
        providerId: context.account.id,
        providerLabel: context.account.label,
        models: context.models,
      };
    } catch (error) {
      const service = getProviderService();
      const accounts = (await service.listAccounts()).filter((account) => account.enabled);
      const defaultId = await service.getDefaultAccountId();
      const account = defaultId ? accounts.find((candidate) => candidate.id === defaultId) : undefined;
      return {
        supported: false,
        providerId: account?.id,
        providerLabel: account?.label,
        models: account ? videoModelsForAccount(account) : [DEFAULT_VIDEO_MODEL],
        reason: errorMessage(error),
      };
    }
  }

  async create(inputs: JsonRecord) {
    return createProviderVideoTask(await resolveCurrentVideoProvider(), inputs);
  }

  async refresh(job: AiAppJob) {
    return refreshProviderVideoTask(await resolveCurrentVideoProvider(), job);
  }
}

class AcceptanceVideoTaskClient implements AiAppVideoTaskClient {
  async capabilities() {
    return {
      supported: true,
      providerId: 'acceptance-provider',
      providerLabel: 'Acceptance Video Provider',
      models: [DEFAULT_VIDEO_MODEL, 'seedance-2.0-pro'],
    };
  }

  async create(inputs: JsonRecord): Promise<VideoTaskCreation> {
    if (!stringInput(inputs, 'productText')) throw new Error('Product text is required for video generation.');
    return {
      providerId: 'acceptance-provider',
      providerLabel: 'Acceptance Video Provider',
      providerTaskId: 'provider-video-task-001',
      status: 'queued',
      rawResponseSummary: '{"id":"provider-video-task-001","status":"queued"}',
      endpoint: '/video/generations',
    };
  }

  async refresh(job: AiAppJob): Promise<VideoTaskCreation> {
    return {
      providerId: job.providerId || 'acceptance-provider',
      providerLabel: job.providerLabel || 'Acceptance Video Provider',
      providerTaskId: job.providerTaskId,
      status: 'completed',
      rawResponseSummary: '{"id":"provider-video-task-001","status":"completed","url":"https://example.com/product-video.mp4"}',
      resultUrl: 'https://example.com/product-video.mp4',
      endpoint: '/video/generations',
    };
  }
}

function resolveDefaultRunner(): AiAppRunner {
  return process.env.CLAWX_E2E === '1' || process.env.NODE_ENV === 'test'
    ? new AcceptanceAiAppRunner()
    : new FeiniuAiAppRunner();
}

function resolveDefaultVideoTaskClient(): AiAppVideoTaskClient {
  return process.env.CLAWX_E2E === '1' || process.env.NODE_ENV === 'test'
    ? new AcceptanceVideoTaskClient()
    : new ProviderVideoTaskClient();
}

function resolveDefaultBillingClient(): AiAppBillingClient {
  return process.env.CLAWX_E2E === '1' || process.env.NODE_ENV === 'test'
    ? new AcceptanceAiAppBillingClient()
    : new ServerAiAppBillingClient();
}

function videoOutputs(job: AiAppJob, resultUrl: string): AiAppJobOutputs {
  return {
    assetCount: 1,
    assets: [{
      id: `${job.id}-video`,
      type: 'video',
      title: 'Generated product video',
      description: 'Provider-generated product short video',
      downloadUrl: resultUrl,
      metadata: { ratio: stringInput(job.inputs, 'ratio', '9:16'), providerTaskId: job.providerTaskId },
    }],
  };
}

function updateJob(id: string, patch: Partial<AiAppJob>): AiAppJob | null {
  const current = jobs.get(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  jobs.set(id, next);
  return next;
}

function startJob(job: AiAppJob, runner: AiAppRunner, billing: AiAppBillingClient): void {
  updateJob(job.id, { status: 'running' });
  void runner.run({ jobId: job.id, appId: job.appId, inputs: job.inputs })
    .then(async (outputs) => {
      const pointsUsed = await billing.debit(job.appId, job.billingTierId || '', job.id);
      updateJob(job.id, { status: 'completed', outputs, pointsUsed });
    })
    .catch((error) => {
      updateJob(job.id, { status: 'failed', error: errorMessage(error) });
    });
}

async function createLiveJob(payload: unknown, runner: AiAppRunner, billing: AiAppBillingClient): Promise<AiAppJob> {
  const body = (isRecord(payload) ? payload : {}) as Partial<AiAppCreateJobPayload>;
  const appId = normalizeAppId(body.appId);
  const workflow = getAiWorkflowDefinition(appId);
  if (!workflow) throw new Error(`Unknown AI workflow: ${appId}`);
  if (workflow.providerCapability === 'video') {
    throw new Error('Video workflows must use the asynchronous video task API.');
  }
  const inputs = normalizeInputs(body.inputs);
  const billingTierId = billingTierForWorkflow(appId, inputs);
  await assertAffordable(billing, appId, billingTierId);
  if (
    appId === 'detail-poster-generator'
    && referenceImagesInput(inputs).length > 0
    && !IMAGE_TO_IMAGE_MODELS.has(stringInput(inputs, 'model', CANVASLAND_IMAGE_MODEL))
  ) {
    throw new Error('当前模型不支持参考图生成');
  }
  const now = new Date().toISOString();
  const job: AiAppJob = {
    id: createJobId(appId),
    localJobId: '',
    appId,
    mode: normalizeMode(body.mode),
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    inputs,
    billingTierId,
  };
  job.localJobId = job.id;
  jobs.set(job.id, job);
  startJob(job, runner, billing);
  return jobs.get(job.id) || job;
}

async function createVideoLiveJob(payload: unknown, client: AiAppVideoTaskClient, billing: AiAppBillingClient): Promise<AiAppJob> {
  const body = (isRecord(payload) ? payload : {}) as Partial<AiAppCreateJobPayload>;
  const appId = normalizeAppId(body.appId);
  const workflow = getAiWorkflowDefinition(appId);
  if (workflow?.providerCapability !== 'video') throw new Error('Video task client only supports video workflows.');
  const now = new Date().toISOString();
  const id = createJobId(appId);
  const inputs = normalizeInputs(body.inputs);
  const billingTierId = billingTierForWorkflow(appId, inputs);
  await assertAffordable(billing, appId, billingTierId);
  const job: AiAppJob = {
    id,
    localJobId: id,
    appId,
    mode: normalizeMode(body.mode),
    status: 'running',
    createdAt: now,
    updatedAt: now,
    inputs,
    billingTierId,
  };
  jobs.set(id, job);
  try {
    const created = await client.create(job.inputs);
    const pointsUsed = created.status === 'completed' && created.resultUrl
      ? await billing.debit(job.appId, billingTierId, job.id)
      : undefined;
    const result = updateJob(id, {
      status: created.status,
      providerId: created.providerId,
      providerLabel: created.providerLabel,
      providerTaskId: created.providerTaskId,
      rawResponseSummary: created.rawResponseSummary,
      resultUrl: created.resultUrl,
      pointsUsed,
      inputs: { ...job.inputs, ...(created.endpoint ? { providerEndpoint: created.endpoint } : {}) },
      ...(created.resultUrl ? { outputs: videoOutputs({ ...job, providerTaskId: created.providerTaskId }, created.resultUrl) } : {}),
    });
    return result || job;
  } catch (error) {
    return updateJob(id, { status: 'failed', error: errorMessage(error) }) || job;
  }
}

async function refreshVideoJob(job: AiAppJob, client: AiAppVideoTaskClient, billing: AiAppBillingClient): Promise<AiAppJob> {
  if (job.appId !== 'product-short-video') return job;
  if (job.status === 'completed' || job.status === 'failed') return job;
  try {
    const refreshed = await client.refresh(job);
    const pointsUsed = refreshed.status === 'completed' && refreshed.resultUrl
      ? await billing.debit(job.appId, job.billingTierId || '', job.id)
      : job.pointsUsed;
    const next = updateJob(job.id, {
      status: refreshed.status,
      providerId: refreshed.providerId,
      providerLabel: refreshed.providerLabel,
      providerTaskId: refreshed.providerTaskId || job.providerTaskId,
      rawResponseSummary: refreshed.rawResponseSummary,
      resultUrl: refreshed.resultUrl,
      pointsUsed,
      error: undefined,
      ...(refreshed.resultUrl ? { outputs: videoOutputs(job, refreshed.resultUrl) } : {}),
    });
    return next || job;
  } catch (error) {
    return updateJob(job.id, { status: 'failed', error: errorMessage(error) }) || job;
  }
}

export function createAiAppsApi(options: { runner?: AiAppRunner; videoTaskClient?: AiAppVideoTaskClient; billingClient?: AiAppBillingClient } = {}): CompleteHostServiceRegistry['aiApps'] {
  const runner = options.runner || resolveDefaultRunner();
  const videoTaskClient = options.videoTaskClient || resolveDefaultVideoTaskClient();
  const billingClient = options.billingClient || resolveDefaultBillingClient();
  return {
    listWorkflows: async () => ({
      success: true,
      workflows: listAiWorkflowDefinitions(),
    }),
    createJob: async (payload) => {
      try {
        const appId = isRecord(payload) && typeof payload.appId === 'string' ? payload.appId : '';
        const workflow = getAiWorkflowDefinition(appId.trim());
        if (workflow?.providerCapability === 'video') {
          return { success: true, job: await createVideoLiveJob(payload, videoTaskClient, billingClient) };
        }
        return { success: true, job: await createLiveJob(payload, runner, billingClient) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    getJob: async (payload) => {
      try {
        const body = (isRecord(payload) ? payload : {}) as { id?: unknown };
        const id = normalizeJobId(body.id);
        const job = jobs.get(id);
        if (!job) return { success: false, error: 'job not found' };
        return { success: true, job };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    refreshJob: async (payload) => {
      try {
        const body = (isRecord(payload) ? payload : {}) as { id?: unknown };
        const id = normalizeJobId(body.id);
        const job = jobs.get(id);
        if (!job) return { success: false, error: 'job not found' };
        return { success: true, job: await refreshVideoJob(job, videoTaskClient, billingClient) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    videoCapabilities: async () => {
      try {
        return { success: true, capabilities: await videoTaskClient.capabilities() };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
    listResults: async (payload) => {
      try {
        const body = isRecord(payload) ? payload as AiAppListResultsPayload : {};
        const appId = typeof body.appId === 'string' && body.appId.trim() ? body.appId.trim() : undefined;
        const filteredJobs = Array.from(jobs.values())
          .filter((job) => !appId || job.appId === appId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        return { success: true, jobs: filteredJobs };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  };
}
