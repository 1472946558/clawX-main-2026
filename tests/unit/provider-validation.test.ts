import { beforeEach, describe, expect, it, vi } from 'vitest';

const proxyAwareFetch = vi.fn();

vi.mock('@electron/utils/proxy-fetch', () => ({
  proxyAwareFetch,
}));

describe('validateApiKeyWithProvider', () => {
  beforeEach(() => {
    proxyAwareFetch.mockReset();
    proxyAwareFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('validates MiniMax CN keys with Anthropic headers', async () => {
    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');

    const result = await validateApiKeyWithProvider('minimax-portal-cn', 'sk-cn-test');

    expect(result).toMatchObject({ valid: true });
    expect(proxyAwareFetch).toHaveBeenCalledWith(
      'https://api.minimaxi.com/anthropic/v1/models?limit=1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-cn-test',
          'anthropic-version': '2023-06-01',
        }),
      })
    );
  });

  it('still validates OpenAI-compatible providers with bearer auth', async () => {
    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');

    const result = await validateApiKeyWithProvider('openai', 'sk-openai-test');

    expect(result).toMatchObject({ valid: true });
    expect(proxyAwareFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models?limit=1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-openai-test',
        }),
      })
    );
  });

  it('falls back to /responses for openai-responses when /models is unavailable', async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Not Found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Unknown model' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-response-test', {
      baseUrl: 'https://responses.example.com/v1',
      apiProtocol: 'openai-responses',
    });

    expect(result).toMatchObject({ valid: true });
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      1,
      'https://responses.example.com/v1/models?limit=1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-response-test',
        }),
      })
    );
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      2,
      'https://responses.example.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('falls back to /chat/completions for openai-completions when /models is unavailable', async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Not Found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Unknown model' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-chat-test', {
      baseUrl: 'https://chat.example.com/v1',
      apiProtocol: 'openai-completions',
    });

    expect(result).toMatchObject({ valid: true });
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      2,
      'https://chat.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('falls back to /chat/completions when /models returns a non-auth 405 error', async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Unknown model' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-chat-fallback', {
      baseUrl: 'https://chat.example.com/v1',
      apiProtocol: 'openai-completions',
    });

    expect(result).toMatchObject({ valid: true });
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      1,
      'https://chat.example.com/v1/models?limit=1',
      expect.anything(),
    );
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      2,
      'https://chat.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('does not mask auth-like 400 errors behind a fallback probe', async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Invalid API key provided' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-bad-key', {
      baseUrl: 'https://chat.example.com/v1',
      apiProtocol: 'openai-completions',
    });

    expect(result).toMatchObject({ valid: false, error: 'Invalid API key provided', status: 400 });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it('treats incorrect api key wording as an auth failure', async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-bad-key-incorrect', {
      baseUrl: 'https://chat.example.com/v1',
      apiProtocol: 'openai-completions',
    });

    expect(result).toMatchObject({ valid: false, error: 'Incorrect API key provided', status: 400 });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it('treats auth-like error codes on /models as invalid without fallback', async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Bad Request', code: 'invalid_api_key' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-bad-key-code', {
      baseUrl: 'https://chat.example.com/v1',
      apiProtocol: 'openai-completions',
    });

    expect(result).toMatchObject({ valid: false, error: 'Bad Request', status: 400 });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps non-auth invalid_request style 400 probe responses as valid', async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'invalid_request_error: invalid model' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-invalid-model-ok', {
      baseUrl: 'https://chat.example.com/v1',
      apiProtocol: 'openai-completions',
    });

    expect(result).toMatchObject({ valid: true, status: 400 });
  });

  it('treats auth-like error codes on probe responses as invalid after fallback', async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Bad Request', code: 'invalid_api_key' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-bad-key-probe-code', {
      baseUrl: 'https://responses.example.com/v1',
      apiProtocol: 'openai-responses',
    });

    expect(result).toMatchObject({ valid: false, error: 'Bad Request', status: 400 });
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      2,
      'https://responses.example.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('keeps token-limit style 400 probe responses as valid', async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'max tokens exceeded' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-token-limit-ok', {
      baseUrl: 'https://responses.example.com/v1',
      apiProtocol: 'openai-responses',
    });

    expect(result).toMatchObject({ valid: true, status: 400 });
  });

  it('does not mask localized auth-like 400 errors behind a fallback probe', async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: '无效密钥' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-bad-key-cn', {
      baseUrl: 'https://chat.example.com/v1',
      apiProtocol: 'openai-completions',
    });

    expect(result).toMatchObject({ valid: false, error: '无效密钥', status: 400 });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate endpoint suffix when baseUrl already points to /responses', async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Not Found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Unknown model' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-endpoint-test', {
      baseUrl: 'https://openrouter.ai/api/v1/responses',
      apiProtocol: 'openai-responses',
    });

    expect(result).toMatchObject({ valid: true });
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      1,
      'https://openrouter.ai/api/v1/models?limit=1',
      expect.anything(),
    );
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      2,
      'https://openrouter.ai/api/v1/responses',
      expect.anything(),
    );
  });

  it('falls back to /responses when /models returns a non-auth 400 error', async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Bad Request' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Unknown model' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-response-fallback', {
      baseUrl: 'https://responses.example.com/v1',
      apiProtocol: 'openai-responses',
    });

    expect(result).toMatchObject({ valid: true });
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      2,
      'https://responses.example.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('treats localized auth-like 400 probe responses as invalid after fallback', async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: '鉴权失败' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { validateApiKeyWithProvider } = await import('@electron/services/providers/provider-validation');
    const result = await validateApiKeyWithProvider('custom', 'sk-response-cn-auth', {
      baseUrl: 'https://responses.example.com/v1',
      apiProtocol: 'openai-responses',
    });

    expect(result).toMatchObject({ valid: false, error: '鉴权失败', status: 400 });
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      2,
      'https://responses.example.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});

describe('fetchOpenAiCompatibleModels', () => {
  beforeEach(() => {
    proxyAwareFetch.mockReset();
  });

  it('tries /models before /v1/models and accepts the OpenAI data format', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    proxyAwareFetch
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-b' }],
      }), { status: 200 }));

    const { fetchOpenAiCompatibleModels } = await import('@electron/services/providers/provider-validation');
    const result = await fetchOpenAiCompatibleModels('https://new-api.example.com/', 'sk-secret-value');

    expect(result).toEqual({ success: true, models: ['model-b', 'model-a'] });
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      1,
      'https://new-api.example.com/models',
      { headers: { Authorization: 'Bearer sk-secret-value' } },
    );
    expect(proxyAwareFetch).toHaveBeenNthCalledWith(
      2,
      'https://new-api.example.com/v1/models',
      { headers: { Authorization: 'Bearer sk-secret-value' } },
    );
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain('sk-secret-value');
    logSpy.mockRestore();
  });

  it('accepts a top-level model array', async () => {
    proxyAwareFetch.mockResolvedValueOnce(new Response(JSON.stringify([
      { id: 'array-model' },
    ]), { status: 200 }));

    const { fetchOpenAiCompatibleModels } = await import('@electron/services/providers/provider-validation');
    await expect(fetchOpenAiCompatibleModels('https://feiniu.example.com', 'sk-test'))
      .resolves.toEqual({ success: true, models: ['array-model'] });
  });

  it.each([
    ['not a url', 'sk-test', 'invalid_base_url'],
    ['https://new-api.example.com', '', 'invalid_api_key'],
  ])('classifies local input errors', async (baseUrl, apiKey, errorCode) => {
    const { fetchOpenAiCompatibleModels } = await import('@electron/services/providers/provider-validation');
    await expect(fetchOpenAiCompatibleModels(baseUrl, apiKey)).resolves.toEqual({
      success: false,
      models: [],
      errorCode,
    });
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'invalid_api_key'],
    [404, 'invalid_base_url'],
    [503, 'network_error'],
  ])('classifies HTTP %s failures', async (status, errorCode) => {
    proxyAwareFetch.mockResolvedValue(new Response('{}', { status }));
    const { fetchOpenAiCompatibleModels } = await import('@electron/services/providers/provider-validation');
    await expect(fetchOpenAiCompatibleModels('https://new-api.example.com', 'sk-test'))
      .resolves.toMatchObject({ success: false, errorCode });
  });

  it('distinguishes empty and unsupported successful responses', async () => {
    const { fetchOpenAiCompatibleModels } = await import('@electron/services/providers/provider-validation');

    proxyAwareFetch.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await expect(fetchOpenAiCompatibleModels('https://new-api.example.com', 'sk-test'))
      .resolves.toMatchObject({ success: false, errorCode: 'no_models' });

    proxyAwareFetch.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    await expect(fetchOpenAiCompatibleModels('https://new-api.example.com', 'sk-test'))
      .resolves.toMatchObject({ success: false, errorCode: 'unsupported_format' });
  });

  it('classifies request failures as network errors', async () => {
    proxyAwareFetch.mockRejectedValue(new Error('offline'));
    const { fetchOpenAiCompatibleModels } = await import('@electron/services/providers/provider-validation');
    await expect(fetchOpenAiCompatibleModels('https://new-api.example.com', 'sk-test'))
      .resolves.toEqual({ success: false, models: [], errorCode: 'network_error' });
  });
});
