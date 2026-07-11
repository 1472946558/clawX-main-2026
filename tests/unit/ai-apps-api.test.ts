import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiAppsApi } from '../../electron/services/ai-apps-api';

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

    await vi.waitFor(() => {
      expect(jobsStatus(api, created.job?.id || '')).resolves.toBe('completed');
    });
    const completed = await api.getJob({ id: created.job?.id || '' });
    expect(completed.job?.status).toBe('completed');
    expect(completed.job?.outputs?.assets).toHaveLength(3);
    expect(completed.job?.outputs?.assets[0]).toMatchObject({
      type: 'image',
      title: 'Detail image section',
      titleKey: 'detailImageSection',
      descriptionKey: 'detailImageSection',
      metadata: { ratio: '4:3', quality: 'acceptance' },
    });
  });

  it('returns validation errors for invalid jobs', async () => {
    const api = createAiAppsApi();

    await expect(api.createJob({ appId: '', mode: 'live' })).resolves.toMatchObject({
      success: false,
      error: 'appId is required',
    });
    await expect(api.getJob({ id: 'missing' })).resolves.toMatchObject({
      success: false,
      error: 'job not found',
    });
  });
});
