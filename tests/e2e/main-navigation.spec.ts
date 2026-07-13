import type { ElectronApplication } from '@playwright/test';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

async function readNativeMenuLabels(app: ElectronApplication) {
  return await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const fileMenu = menu?.items.find((item) => item.label === '文件' || item.label === 'File');
    return {
      topLevel: menu?.items.map((item) => item.label) ?? [],
      file: fileMenu?.label,
      newChat: fileMenu?.submenu?.items.find((item) => item.id === 'new-chat' || item.label === 'New Chat' || item.label === '新对话')?.label,
    };
  });
}

test.describe('canvasland main navigation without setup flow', () => {
  test('navigates between core pages with setup bypassed', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);

      await expect(page.getByTestId('main-layout')).toBeVisible();
      await expect(page.getByTestId('chat-page')).toBeVisible();
      await expect(page.getByTestId('main-content')).toBeVisible();
      await expect(page.getByTestId('sidebar-resize-handle')).toBeVisible();
      await expect(page.getByTestId('main-content')).toHaveCSS('border-top-left-radius', '16px');

      await expect(page.getByTestId('sidebar-nav-models')).toHaveCount(0);
      await page.evaluate(() => {
        window.location.hash = '#/models';
      });
      await expect(page.getByTestId('token-topup-page')).toBeVisible();

      await page.getByTestId('sidebar-nav-agents').click();
      await expect(page.getByTestId('agents-page')).toBeVisible();
      await page.getByTestId('agents-add-button').click();
      await expect(page.getByTestId('add-agent-dialog')).toBeVisible();
      const agentModelPlan = page.getByTestId('agent-model-plan-select');
      await expect(agentModelPlan).toBeVisible();
      await expect(agentModelPlan).toContainText('GPT 5.4');
      await expect(agentModelPlan).toContainText('Qwen 3.7 Max');
      await expect(page.getByTestId('agent-persona-textarea')).toBeVisible();
      await expect(page.getByLabel(/API Key/i)).toHaveCount(0);
      await expect(page.getByLabel(/Base URL/i)).toHaveCount(0);
      await expect(page.getByText(/^Provider$/i)).toHaveCount(0);
      await page.keyboard.press('Escape');

      await page.getByTestId('sidebar-nav-channels').click();
      await expect(page.getByTestId('channels-page')).toBeVisible();

      await page.getByTestId('sidebar-nav-ai-apps').click();
      await expect(page.getByTestId('skills-page')).toBeVisible();
      await expect(page.getByTestId('ai-apps-title')).toHaveText('AI Apps');
      await expect(page.getByTestId('ai-apps-category-tabs')).toBeVisible();
      await expect(page.getByTestId('ai-apps-grid').locator('[data-testid^="ai-app-card-"]')).toHaveCount(3);
      await page.getByTestId('ai-app-card-ecommerce-copywriting').click();
      await expect(page.getByTestId('ai-app-billing-tier-short')).toContainText('10 points');
      await expect(page.getByTestId('ai-app-billing-tier-social')).toContainText('15 points');
      await expect(page.getByTestId('ai-app-billing-tier-long')).toContainText('20 points');
      await expect(page.getByTestId('ai-app-billing-tier-deep')).toContainText('30 points');
      await page.getByTestId('ai-app-billing-tier-deep').click();
      await expect(page.getByTestId('ai-app-selected-points')).toContainText('30 points');
      await page.getByTestId('ai-app-workbench-back').click();

      await page.getByTestId('sidebar-nav-skills').click();
      await expect(page.getByTestId('skills-page')).toBeVisible();
      await expect(page.getByTestId('skills-marketplace-title')).toHaveText('Skill Marketplace');
      await expect
        .poll(() => page.getByTestId('skills-marketplace-grid').locator('[data-testid^="skill-marketplace-card-"]').count())
        .toBeGreaterThanOrEqual(6);

      await page.getByTestId('sidebar-nav-token-topup').click();
      await expect(page.getByTestId('token-topup-page')).toBeVisible();
      await expect(page.getByTestId('token-topup-connection-json')).toHaveCount(0);
      await expect(page.getByTestId('token-topup-refresh-balance')).toBeVisible();
      await expect(page.getByTestId('token-topup-recharge-balance')).toContainText('0');
      await expect(page.getByTestId('token-topup-balance')).toContainText('0');
      await expect(page.getByTestId('token-topup-used-balance')).toContainText('0');
      await expect(page.getByTestId('token-topup-recharge-tiers')).toBeVisible();
      await expect(page.getByTestId('token-topup-tier-points-5')).toContainText('500');
      await expect(page.getByTestId('token-topup-tier-points-10')).toContainText('1,000');
      await expect(page.getByTestId('token-topup-tier-points-50')).toContainText('6,000');
      await expect(page.getByTestId('token-topup-tier-20')).toContainText('Base 2,000 points');
      await expect(page.getByTestId('token-topup-tier-20')).toContainText('Bonus 100 points');
      await expect(page.getByTestId('token-topup-tier-20')).toContainText('Total 2,100 points');
      await expect(page.getByTestId('token-topup-tier-50')).toContainText('Total 6,000 points');
      await page.getByTestId('token-topup-custom-amount').fill('12');
      await expect(page.getByTestId('token-topup-custom-points-preview')).toContainText('1,200');
      await page.getByTestId('token-topup-custom-amount').fill('0.09');
      await expect(page.getByTestId('token-topup-custom-points-preview')).toContainText('0');
      await page.getByTestId('token-topup-custom-amount').fill('0.1');
      await expect(page.getByTestId('token-topup-custom-points-preview')).toContainText('10');
      await page.getByRole('button', { name: 'Creem' }).click();
      await expect(page.getByTestId('token-topup-creem-currency')).toBeVisible();
      await expect(page.getByTestId('token-topup-create-selected-payment-qr')).toContainText('Creem');
      await expect(page.getByTestId('token-topup-create-selected-payment-qr')).toBeVisible();
      await expect(page.getByTestId('token-topup-blueocean-config')).toHaveCount(0);
      await expect(page.getByTestId('token-topup-epay-config')).toHaveCount(0);
      await expect.poll(async () => {
        const [cardBox, actionsBox] = await Promise.all([
          page.getByTestId('token-topup-payment-method').boundingBox(),
          page.getByTestId('token-topup-payment-actions').boundingBox(),
        ]);
        if (!cardBox || !actionsBox) return Number.POSITIVE_INFINITY;

        const cardCenter = cardBox.x + cardBox.width / 2;
        const actionsCenter = actionsBox.x + actionsBox.width / 2;
        return Math.abs(cardCenter - actionsCenter);
      }).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('token-topup-usage-records')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('settings exposes configurable update feed URL', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-settings').click();
      await expect(page.getByTestId('settings-page')).toBeVisible();

      const feedUrl = page.getByTestId('update-feed-url');
      await feedUrl.scrollIntoViewIfNeeded();
      await expect(feedUrl).toBeVisible();
      await expect(page.getByTestId('update-feed-url-save')).toBeVisible();
      await expect(page.getByTestId('update-feed-url-clear')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('native New Chat menu opens the same chat route as the sidebar action', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('chat-page')).toBeVisible();

      await page.getByTestId('sidebar-nav-token-topup').click();
      await expect(page.getByTestId('token-topup-page')).toBeVisible();

      await app.evaluate(({ BrowserWindow, Menu }) => {
        const menu = Menu.getApplicationMenu();
        const findMenuItem = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
          for (const item of items) {
            if (item.id === 'new-chat') return item;
            const child = item.submenu ? findMenuItem(item.submenu.items) : undefined;
            if (child) return child;
          }
          return undefined;
        };
        const newChatItem = menu ? findMenuItem(menu.items) : undefined;
        newChatItem?.click(undefined, BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0], undefined);
      });

      await expect(page.getByTestId('chat-page')).toBeVisible();
      await expect(page).toHaveURL(/#\/$/);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('refreshes native menu labels after switching language', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);

      await page.getByTestId('sidebar-nav-settings').click();
      await page.getByRole('button', { name: 'English' }).click();
      await page.getByRole('button', { name: '中文' }).click();

      await expect(page.getByText('菜单语言已更新')).toBeVisible();
      await expect.poll(() => readNativeMenuLabels(app)).toMatchObject({
        file: '文件',
        newChat: '新对话',
      });
    } finally {
      await closeElectronApp(app);
    }
  });
});
