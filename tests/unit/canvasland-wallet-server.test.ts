import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

let child: ChildProcess | null = null;
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
});
