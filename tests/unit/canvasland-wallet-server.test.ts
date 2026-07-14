import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

let child: ChildProcess | null = null;
let upstreamServer: Server | null = null;
let dataDir = '';

async function waitForServer(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('wallet server did not start');
}

afterEach(async () => {
  child?.kill('SIGTERM');
  child = null;
  await new Promise<void>((resolve) => {
    if (!upstreamServer) {
      resolve();
      return;
    }
    upstreamServer.close(() => resolve());
  });
  upstreamServer = null;
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  dataDir = '';
});

describe('canvasland wallet server AI App billing', () => {
  it('ignores client points and debits the same request id once', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'canvasland-wallet-'));
    await writeFile(join(dataDir, 'wallet.json'), JSON.stringify({
      totalGranted: 1000,
      totalUsed: 0,
      totalAvailable: 1000,
      records: [{
        id: 'seed-credit',
        kind: 'topup',
        provider: 'epay',
        paymentKind: 'alipay',
        points: 1000,
        status: 'paid',
        createdAt: new Date().toISOString(),
      }],
      orders: {},
      usageRequests: {},
    }), 'utf8');
    const port = 39_000 + Math.floor(Math.random() * 1_000);
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/canvasland-wallet-api/server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
      stdio: 'ignore',
    });
    await waitForServer(baseUrl);

    const payload = {
      workflowId: 'ecommerce-copywriting',
      billingTierId: 'social',
      requestId: 'aiapp-test-idempotent',
      pointsUsed: 999_999,
    };
    const first = await fetch(`${baseUrl}/api/usage/debit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((response) => response.json());
    const duplicate = await fetch(`${baseUrl}/api/usage/debit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((response) => response.json());
    const balance = await fetch(`${baseUrl}/api/wallet/balance`).then((response) => response.json());

    expect(first).toMatchObject({ success: true, duplicate: false, pointsUsed: 15 });
    expect(duplicate).toMatchObject({ success: true, duplicate: true, pointsUsed: 15 });
    expect(balance.wallet).toMatchObject({ totalGranted: 1000, totalUsed: 15, totalAvailable: 985 });
  });

  it('proxies streaming chat completions and debits usage after the stream ends', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'canvasland-wallet-'));
    await writeFile(join(dataDir, 'wallet.json'), JSON.stringify({
      totalGranted: 1000,
      totalUsed: 0,
      totalAvailable: 1000,
      records: [{
        id: 'seed-credit',
        kind: 'topup',
        provider: 'epay',
        paymentKind: 'alipay',
        points: 1000,
        status: 'paid',
        createdAt: new Date().toISOString(),
      }],
      orders: {},
      usageRequests: {},
    }), 'utf8');

    let upstreamBody: any = null;
    upstreamServer = createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        upstreamBody = JSON.parse(raw);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        });
        res.write('data: {"id":"chatcmpl-stream","choices":[{"delta":{"content":"pong"}}]}\n\n');
        res.write('data: {"id":"chatcmpl-stream","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    const upstreamPort = 40_000 + Math.floor(Math.random() * 1_000);
    await new Promise<void>((resolve) => upstreamServer?.listen(upstreamPort, '127.0.0.1', () => resolve()));

    const port = 39_000 + Math.floor(Math.random() * 1_000);
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/canvasland-wallet-api/server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dataDir,
        CANVASLAND_NEWAPI_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1`,
        CANVASLAND_MODEL_GPT54_API_KEY: 'sk-test-upstream-key',
      },
      stdio: 'ignore',
    });
    await waitForServer(baseUrl);

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': 'stream-test-id',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        stream: true,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    const text = await response.text();
    const balance = await fetch(`${baseUrl}/api/wallet/balance`).then((item) => item.json());

    expect(response.status).toBe(200);
    expect(upstreamBody).toMatchObject({
      model: 'gpt-5.4',
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(text).toContain('pong');
    expect(text).not.toContain('canvasland_usage');
    expect(text.trim()).toMatch(/data: \[DONE\]$/);
    expect(balance.wallet).toMatchObject({ totalGranted: 1000, totalUsed: 1, totalAvailable: 999 });
  });
});
