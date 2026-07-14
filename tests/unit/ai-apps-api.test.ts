import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiAppsApi, normalizeChatCompletionsEndpoint, parseEcommerceCopywritingResult } from '../../electron/services/ai-apps-api';

async function jobsStatus(api: ReturnType<typeof createAiAppsApi>, id: string) {
  const result = await api.getJob({ id });
  return result.job?.status;
}

describe('ai apps host api service', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates and lists live jobs with runner outputs', async () => {
    const api = createAiAppsApi();

    const created = await api.createJob({
      appId: 'detail-poster-generator',
      mode: 'live',
      inputs: { prompt: 'product' },
    });

    expect(created.success).toBe(true);
    expect(created.job).toMatchObject({
      appId: 'detail-poster-generator',
      mode: 'live',
      status: 'running',
      inputs: { prompt: 'product' },
    });

    const fetched = await api.getJob({ id: created.job?.id || '' });
    expect(fetched.success).toBe(true);
    expect(fetched.job?.id).toBe(created.job?.id);

    const listed = await api.listResults({ appId: 'detail-poster-generator' });
    expect(listed.success).toBe(true);
    expect(listed.jobs?.some((job) => job.id === created.job?.id)).toBe(true);

    await vi.waitFor(async () => {
      await expect(jobsStatus(api, created.job?.id || '')).resolves.toBe('succeeded');
    });
    const completed = await api.getJob({ id: created.job?.id || '' });
    expect(completed.job?.status).toBe('succeeded');
    expect(completed.job?.outputs?.assets).toHaveLength(3);
    expect(completed.job?.outputs?.assets[0]).toMatchObject({
      type: 'image',
      title: 'Detail image section',
      titleKey: 'detailImageSection',
      descriptionKey: 'detailImageSection',
      metadata: { ratio: '4:3', quality: 'acceptance' },
    });
  });

  it('lists the three customer-confirmed workflow definitions', async () => {
    const api = createAiAppsApi();

    const result = await api.listWorkflows();

    expect(result.success).toBe(true);
    expect(result.workflows?.map((workflow) => workflow.id)).toEqual([
      'ecommerce-copywriting',
      'detail-poster-generator',
      'product-short-video',
    ]);
    expect(result.workflows?.[0]).toMatchObject({
      outputType: 'text',
      providerCapability: 'chat',
      asyncTask: false,
    });
    expect(result.workflows?.[2]).toMatchObject({
      outputType: 'video',
      providerCapability: 'video',
      asyncTask: true,
    });
  });

  it('returns validation errors for invalid jobs', async () => {
    const api = createAiAppsApi();

    await expect(api.createJob({ appId: '', mode: 'live' })).resolves.toMatchObject({
      success: false,
      error: 'appId is required',
    });
    await expect(api.createJob({ appId: 'ocr', mode: 'live' })).resolves.toMatchObject({
      success: false,
      error: 'Unknown AI workflow: ocr',
    });
    await expect(api.getJob({ id: 'missing' })).resolves.toMatchObject({
      success: false,
      error: 'job not found',
    });
  });

  it('preserves every controlled ecommerce copy field for the backend runner', async () => {
    const run = vi.fn().mockResolvedValue({ assetCount: 0, assets: [] });
    const api = createAiAppsApi({ runner: { run } });
    const inputs = {
      productName: '轻量通勤双肩包',
      sellingPoints: '防泼水、独立电脑仓',
      platform: 'jd',
      brandTone: '专业可信',
      targetAudience: '城市通勤人群',
      useScene: '通勤与短途出差',
    };

    const created = await api.createJob({ appId: 'ecommerce-copywriting', inputs });
    await vi.waitFor(() => expect(run).toHaveBeenCalled());

    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      appId: 'ecommerce-copywriting',
      inputs,
    }));
    expect(created.job?.inputs).toEqual(inputs);
  });

  it('returns structured ecommerce copywriting outputs instead of repeated text assets', async () => {
    const api = createAiAppsApi();

    const created = await api.createJob({
      appId: 'ecommerce-copywriting',
      inputs: {
        productName: '轻量通勤双肩包',
        sellingPoints: '防泼水、独立电脑仓',
        platform: 'jd',
      },
    });

    await vi.waitFor(async () => {
      const result = await api.getJob({ id: created.job?.id || '' });
      expect(result.job?.status).toBe('succeeded');
    });
    const completed = await api.getJob({ id: created.job?.id || '' });
    expect(completed.job?.outputs?.ecommerceCopywriting?.titleOptions.length).toBeGreaterThanOrEqual(3);
    expect(completed.job?.outputs?.assets.map((asset) => asset.metadata?.resultType)).toEqual([
      'title_options',
      'selling_points',
      'detail_page',
      'video_script',
      'keywords',
    ]);
    expect(completed.job?.outputs?.assets.every((asset) => asset.downloadUrl == null)).toBe(true);
  });

  it('rejects unstructured ecommerce copywriting text for fallback handling', () => {
    expect(() => parseEcommerceCopywritingResult('只有一段普通文案', 'job-1', 'model-1')).toThrow('结构化解析失败');
  });

  it('charges the server-owned tier only after a successful job', async () => {
    const run = vi.fn().mockResolvedValue({ assetCount: 1, assets: [] });
    const billingClient = {
      quote: vi.fn().mockResolvedValue({ points: 60, affordable: true, availablePoints: 500 }),
      debit: vi.fn().mockResolvedValue(60),
    };
    const api = createAiAppsApi({ runner: { run }, billingClient });

    const created = await api.createJob({
      appId: 'detail-poster-generator',
      inputs: { prompt: 'premium poster', billingTierId: 'pro' },
    });

    await vi.waitFor(async () => {
      const result = await api.getJob({ id: created.job?.id || '' });
      expect(result.job).toMatchObject({ status: 'succeeded', billingTierId: 'pro', pointsUsed: 60 });
    });
    expect(billingClient.quote).toHaveBeenCalledWith('detail-poster-generator', 'pro');
    expect(billingClient.debit).toHaveBeenCalledWith('detail-poster-generator', 'pro', created.job?.id);
  });

  it('does not dispatch or debit when the wallet cannot afford the selected tier', async () => {
    const run = vi.fn().mockResolvedValue({ assetCount: 1, assets: [] });
    const billingClient = {
      quote: vi.fn().mockResolvedValue({ points: 600, affordable: false, availablePoints: 120 }),
      debit: vi.fn().mockResolvedValue(600),
    };
    const api = createAiAppsApi({ runner: { run }, billingClient });

    const created = await api.createJob({
      appId: 'detail-poster-generator',
      inputs: { prompt: 'premium poster', billingTierId: 'pro' },
    });

    expect(created).toMatchObject({ success: false, error: expect.stringContaining('积分不足') });
    expect(run).not.toHaveBeenCalled();
    expect(billingClient.debit).not.toHaveBeenCalled();
  });

  it('does not debit a failed provider job', async () => {
    const billingClient = {
      quote: vi.fn().mockResolvedValue({ points: 30, affordable: true, availablePoints: 500 }),
      debit: vi.fn().mockResolvedValue(30),
    };
    const api = createAiAppsApi({
      runner: { run: vi.fn().mockRejectedValue(new Error('provider failed')) },
      billingClient,
    });

    const created = await api.createJob({
      appId: 'detail-poster-generator',
      inputs: { prompt: 'poster', billingTierId: 'standard' },
    });
    await vi.waitFor(async () => {
      await expect(jobsStatus(api, created.job?.id || '')).resolves.toBe('failed');
    });
    expect(billingClient.debit).not.toHaveBeenCalled();
  });

  it('preserves staged reference metadata for the backend runner', async () => {
    const run = vi.fn().mockResolvedValue({ assetCount: 0, assets: [] });
    const api = createAiAppsApi({ runner: { run } });
    const reference = {
      id: 'staged-reference-1',
      fileName: 'product.webp',
      mimeType: 'image/webp',
      fileSize: 2048,
      stagedPath: '/tmp/.openclaw/media/outbound/staged-reference-1.webp',
    };

    const created = await api.createJob({
      appId: 'detail-poster-generator',
      mode: 'live',
      inputs: {
        prompt: 'Create a clean product detail poster',
        model: 'image-01',
        ratio: '3:4',
        referenceImages: [reference],
      },
    });

    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      appId: 'detail-poster-generator',
      inputs: expect.objectContaining({ referenceImages: [reference] }),
    }));
    expect(created.success).toBe(true);
  });

  it('rejects references when the selected model lacks image-to-image support', async () => {
    const api = createAiAppsApi({
      runner: { run: vi.fn().mockResolvedValue({ assetCount: 0, assets: [] }) },
    });

    await expect(api.createJob({
      appId: 'detail-poster-generator',
      mode: 'live',
      inputs: {
        model: 'text-image-only',
        referenceImages: [{
          id: 'ref',
          fileName: 'ref.png',
          mimeType: 'image/png',
          fileSize: 100,
          stagedPath: '/tmp/ref.png',
        }],
      },
    })).resolves.toEqual({
      success: false,
      error: '当前模型不支持参考图生成',
    });
  });

  it('normalizes OpenAI-compatible chat completion endpoints', () => {
    expect(normalizeChatCompletionsEndpoint('https://api.example.com')).toBe('https://api.example.com/v1/chat/completions');
    expect(normalizeChatCompletionsEndpoint('https://api.example.com/v1/')).toBe('https://api.example.com/v1/chat/completions');
    expect(normalizeChatCompletionsEndpoint('https://api.example.com/api/v3')).toBe('https://api.example.com/api/v3/chat/completions');
  });

  it('creates and refreshes an asynchronous provider video task', async () => {
    const videoTaskClient = {
      capabilities: vi.fn(async () => ({
        supported: true,
        providerId: 'current-provider',
        providerLabel: 'Current Provider',
        models: ['provider-video-model', 'seedance-2.0-720p'],
      })),
      create: vi.fn(async () => ({
        providerId: 'current-provider',
        providerLabel: 'Current Provider',
        providerTaskId: 'task-123',
        status: 'queued' as const,
        rawResponseSummary: '{"id":"task-123","status":"queued"}',
        endpoint: '/video/generations',
      })),
      refresh: vi.fn(async () => ({
        providerId: 'current-provider',
        providerLabel: 'Current Provider',
        providerTaskId: 'task-123',
        status: 'completed' as const,
        rawResponseSummary: '{"id":"task-123","status":"completed"}',
        resultUrl: 'https://cdn.example.com/task-123.mp4',
      })),
    };
    const api = createAiAppsApi({ videoTaskClient });

    const capabilities = await api.videoCapabilities();
    expect(capabilities.capabilities?.models).toEqual(['provider-video-model', 'seedance-2.0-720p']);

    const created = await api.createJob({
      appId: 'product-short-video',
      mode: 'live',
      inputs: {
        productText: 'Water-resistant commuter backpack',
        sellingPoints: 'Lightweight and organized',
        platform: 'douyin',
        ratio: '9:16',
        videoModel: 'provider-video-model',
      },
    });
    expect(created.job).toMatchObject({
      localJobId: created.job?.id,
      providerId: 'current-provider',
      providerTaskId: 'task-123',
      status: 'queued',
      rawResponseSummary: expect.stringContaining('task-123'),
    });

    const refreshed = await api.refreshJob({ id: created.job?.id || '' });
    expect(refreshed.job).toMatchObject({
      status: 'completed',
      resultUrl: 'https://cdn.example.com/task-123.mp4',
    });
    expect(refreshed.job?.outputs?.assets[0]).toMatchObject({
      type: 'video',
      downloadUrl: 'https://cdn.example.com/task-123.mp4',
    });
  });

  it('preserves the real provider error on a failed video task', async () => {
    const api = createAiAppsApi({
      videoTaskClient: {
        capabilities: async () => ({ supported: false, models: ['seedance-2.0-720p'], reason: 'Provider has no video endpoint' }),
        create: async () => { throw new Error('Provider quota exhausted for seedance-2.0-720p'); },
        refresh: async () => { throw new Error('not used'); },
      },
    });

    const created = await api.createJob({
      appId: 'product-short-video',
      inputs: { productText: 'Product', sellingPoints: 'Benefit', videoModel: 'seedance-2.0-720p' },
    });
    expect(created.job).toMatchObject({
      status: 'failed',
      error: 'Provider quota exhausted for seedance-2.0-720p',
    });
  });
});
