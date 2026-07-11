import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
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

type AiAppRunnerInput = {
  jobId: string;
  appId: string;
  inputs: JsonRecord;
};

export type AiAppRunner = {
  run: (input: AiAppRunnerInput) => Promise<AiAppJobOutputs>;
};

const jobs = new Map<string, AiAppJob>();
const CANVASLAND_NEWAPI_BASE_URL = 'https://feiniu.space/v1';
const CANVASLAND_NEWAPI_AUTH_PROVIDERS = ['custom-canvasla', 'clawx-openai-image'];
const CANVASLAND_TEXT_MODEL = 'gpt-5.5';
const CANVASLAND_IMAGE_MODEL = 'image-01';
const CANVASLAND_VIDEO_MODEL = 'seedance-2.0-720p';
const VIDEO_GENERATION_ENDPOINTS = ['/video/generations', '/videos'];

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
  return value.trim();
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

function safeApiMessage(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 600);
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
  for (const key of ['url', 'video_url', 'image_url', 'download_url', 'output_url']) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const output = item.output;
  if (Array.isArray(output)) {
    const url = output.find((entry) => typeof entry === 'string' && entry.trim());
    if (typeof url === 'string') return url.trim();
  }
  return null;
}

function extractGeneratedId(response: JsonRecord): string | null {
  const item = extractGeneratedItem(response);
  for (const key of ['id', 'task_id', 'taskId', 'request_id']) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function writeImageGeneration(response: JsonRecord, outputPath: string): Promise<void> {
  const item = extractGeneratedItem(response);
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

async function fetchVideoStatus(endpoint: string, id: string): Promise<JsonRecord | null> {
  const key = await readCanvaslandNewApiKey();
  const candidates = [
    `${CANVASLAND_NEWAPI_BASE_URL}${endpoint}/${encodeURIComponent(id)}`,
    `${CANVASLAND_NEWAPI_BASE_URL}${endpoint}?id=${encodeURIComponent(id)}`,
    `${CANVASLAND_NEWAPI_BASE_URL}/tasks/${encodeURIComponent(id)}`,
  ];

  for (const url of candidates) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
    if (response.status === 404 || response.status === 405) continue;
    const text = await response.text();
    const json = (() => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    })();
    if (response.ok && isRecord(json)) return json;
    if (!response.ok && response.status !== 400) {
      throw new Error(`Feiniu video status failed (${response.status}): ${safeApiMessage(text)}`);
    }
  }
  return null;
}

async function waitForVideoAsset(endpoint: string, response: JsonRecord, timeoutMs = 600_000): Promise<JsonRecord> {
  if (extractGeneratedUrl(response)) return response;
  const id = extractGeneratedId(response);
  if (!id) return response;

  const deadline = Date.now() + timeoutMs;
  let latest = response;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const next = await fetchVideoStatus(endpoint, id);
    if (!next) break;
    latest = next;
    const status = String(extractGeneratedItem(next).status || next.status || '').toLowerCase();
    if (extractGeneratedUrl(next)) return next;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      throw new Error(`Feiniu video generation failed: ${safeApiMessage(JSON.stringify(next))}`);
    }
  }
  return latest;
}

async function createNewApiImage(prompt: string, ratio: string, outputPath: string): Promise<JsonRecord> {
  const response = await fetchNewApiJson('/images/generations', {
    model: CANVASLAND_IMAGE_MODEL,
    prompt,
    size: sizeForRatio(ratio),
    n: 1,
  }, 300_000);
  await writeImageGeneration(response, outputPath);
  return response;
}

function extractChatCompletionText(response: JsonRecord): string {
  const choices = response.choices;
  if (!Array.isArray(choices) || !isRecord(choices[0])) {
    throw new Error('Feiniu text generation completed without choices');
  }
  const message = choices[0].message;
  if (isRecord(message) && typeof message.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }
  const text = choices[0].text;
  if (typeof text === 'string' && text.trim()) {
    return text.trim();
  }
  throw new Error('Feiniu text generation completed without text');
}

async function createNewApiText(prompt: string): Promise<string> {
  const response = await fetchNewApiJson('/chat/completions', {
    model: CANVASLAND_TEXT_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a commercial ecommerce operations assistant. Return concise, structured Chinese output unless the user explicitly requests another language.',
      },
      { role: 'user', content: prompt },
    ],
    stream: false,
  }, 180_000);
  return extractChatCompletionText(response);
}

async function createNewApiVideo(prompt: string, ratio: string, outputPath: string): Promise<JsonRecord> {
  let lastError: Error | null = null;
  for (const endpoint of VIDEO_GENERATION_ENDPOINTS) {
    try {
      const initial = await fetchNewApiJson(endpoint, {
        model: CANVASLAND_VIDEO_MODEL,
        prompt,
        duration: 6,
        size: sizeForRatio(ratio),
        resolution: '720p',
      }, 300_000);
      const completed = await waitForVideoAsset(endpoint, initial);
      const url = extractGeneratedUrl(completed);
      if (!url) {
        throw new Error('Feiniu video generation completed without a downloadable video');
      }
      await writeFile(outputPath, await fetchNewApiAsset(url, 300_000));
      return completed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!lastError.message.includes('Invalid URL') && !lastError.message.includes('(404)')) break;
    }
  }
  throw lastError || new Error('Feiniu video generation failed');
}

function buildCommercialPrompt(appId: string, inputs: JsonRecord): string {
  const platformRule = resolveEcommercePlatformRule(inputs.platform);
  const ratio = stringInput(inputs, 'ratio', '1:1');
  const appTitle = stringInput(inputs, 'appTitle', appId);
  const platformLine = buildPlatformRulePrompt(platformRule);
  const common = `${platformLine}\n应用：${appTitle}\n画面比例：${ratio}\n请输出可直接用于电商运营的正式商用内容，且必须在输出末尾列出平台合规检查结果。`;

  if (appId === 'ecommerce-copywriting') {
    return `${common}\n任务：生成商品标题、卖点文案、详情页文案和短视频脚本钩子。输出 JSON，字段包含 titles、bullets、detailCopy、videoHook、complianceNotes。`;
  }
  if (appId === 'detail-poster-generator') {
    return `${common}\n任务：生成商品详情图/详情海报方案。请描述版式、主视觉、卖点模块、详情页顺序、图片提示词和合规注意事项。`;
  }
  if (appId === 'product-short-video') {
    return `${common}\n任务：生成商品短视频方案。请给出 6-12 秒脚本、镜头分镜、封面帧提示词、字幕文案和合规注意事项。`;
  }
  return `${common}\n任务：生成电商 AI 应用输出方案。`;
}

function createAcceptedOutputs(appId: string, jobId: string, source: 'openclaw' | 'acceptance' | 'feiniu', resultText: string, outputPath?: string): AiAppJobOutputs {
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
      const result = await createNewApiText(prompt);
      const outputPath = join(outputDir, 'copywriting-output.txt');
      await writeFile(outputPath, result, 'utf-8');
      return createAcceptedOutputs(input.appId, input.jobId, 'feiniu', result, outputPath);
    }

    if (input.appId === 'product-short-video') {
      const outputPath = join(outputDir, 'product-video.mp4');
      const response = await createNewApiVideo(prompt, stringInput(input.inputs, 'ratio', '9:16'), outputPath);
      return createAcceptedOutputs(input.appId, input.jobId, 'feiniu', JSON.stringify(response, null, 2), outputPath);
    }

    const outputPath = join(outputDir, 'detail-image.png');
    const response = await createNewApiImage(prompt, stringInput(input.inputs, 'ratio', '1:1'), outputPath);
    return createAcceptedOutputs(input.appId, input.jobId, 'feiniu', JSON.stringify(response, null, 2), outputPath);
  }
}

class AcceptanceAiAppRunner implements AiAppRunner {
  async run(input: AiAppRunnerInput): Promise<AiAppJobOutputs> {
    return createAcceptedOutputs(input.appId, input.jobId, 'acceptance', 'Acceptance runner output');
  }
}

function resolveDefaultRunner(): AiAppRunner {
  return process.env.CLAWX_E2E === '1' || process.env.NODE_ENV === 'test'
    ? new AcceptanceAiAppRunner()
    : new FeiniuAiAppRunner();
}

function updateJob(id: string, patch: Partial<AiAppJob>): AiAppJob | null {
  const current = jobs.get(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  jobs.set(id, next);
  return next;
}

function startJob(job: AiAppJob, runner: AiAppRunner): void {
  updateJob(job.id, { status: 'running' });
  void runner.run({ jobId: job.id, appId: job.appId, inputs: job.inputs })
    .then((outputs) => {
      updateJob(job.id, { status: 'completed', outputs });
    })
    .catch((error) => {
      updateJob(job.id, { status: 'failed', error: errorMessage(error) });
    });
}

function createLiveJob(payload: unknown, runner: AiAppRunner): AiAppJob {
  const body = (isRecord(payload) ? payload : {}) as Partial<AiAppCreateJobPayload>;
  const appId = normalizeAppId(body.appId);
  const now = new Date().toISOString();
  const job: AiAppJob = {
    id: createJobId(appId),
    appId,
    mode: normalizeMode(body.mode),
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    inputs: normalizeInputs(body.inputs),
  };
  jobs.set(job.id, job);
  startJob(job, runner);
  return jobs.get(job.id) || job;
}

export function createAiAppsApi(options: { runner?: AiAppRunner } = {}): CompleteHostServiceRegistry['aiApps'] {
  const runner = options.runner || resolveDefaultRunner();
  return {
    createJob: async (payload) => {
      try {
        return { success: true, job: createLiveJob(payload, runner) };
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
