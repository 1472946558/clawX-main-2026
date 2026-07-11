import { completeSetup, expect, test } from './fixtures/electron';

test('generates ecommerce copy from the complete controlled form', async ({ page }) => {
  await completeSetup(page);

  await page.getByTestId('sidebar-nav-settings').click();
  await page.getByRole('button', { name: '中文' }).click();
  await expect(page.getByText('菜单语言已更新')).toBeVisible();

  await page.getByTestId('sidebar-nav-ai-apps').click();
  await page.getByTestId('ai-app-card-ecommerce-copywriting').click();

  await page.getByTestId('ai-app-copy-product-name').fill('轻量通勤双肩包');
  await page.getByTestId('ai-app-copy-selling-points').fill('防泼水面料、独立电脑仓、轻量背负');
  await page.getByTestId('ai-app-copy-platform').selectOption('jd');
  await page.getByTestId('ai-app-copy-brand-tone').fill('专业可信、自然克制');
  await page.getByTestId('ai-app-copy-target-audience').fill('城市通勤人群');
  await page.getByTestId('ai-app-copy-use-scene').fill('日常通勤、短途出差');
  await page.getByTestId('ai-app-create-demo-job').click();

  await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('已完成', { timeout: 4_000 });
  await expect(page.getByTestId('ai-app-generated-copy')).toContainText('Acceptance runner output');
  await page.screenshot({
    path: 'output/playwright/acceptance/phase-2-ecommerce-copywriting.png',
    fullPage: true,
  });
});
