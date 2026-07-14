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

  await page.getByTestId('ai-app-copy-tab-settings').click();
  await expect(page.getByTestId('ai-app-copy-tab-settings')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('ai-app-copy-tab-panel-settings')).toBeVisible();
  await page.getByTestId('ai-app-copy-title-count').fill('5');
  await page.getByTestId('ai-app-copy-selling-point-count').fill('3');

  await page.getByTestId('ai-app-copy-tab-input').click();
  await expect(page.getByTestId('ai-app-copy-tab-input')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('ai-app-create-demo-job').click();

  await expect(page.getByTestId('ai-app-copy-tab-session')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('运行中');
  await expect(page.getByTestId('ai-app-copy-tab-preview')).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
  await page.getByTestId('ai-app-copy-tab-session').click();
  await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('已完成');
  await page.getByTestId('ai-app-copy-tab-preview').click();
  await expect(page.getByTestId('ai-app-copy-card-title-options')).toContainText('轻量通勤双肩包');
  await expect(page.getByTestId('ai-app-copy-card-selling-points')).toContainText('防泼水面料');
  await expect(page.getByTestId('ai-app-copy-card-detail-page')).toContainText('城市通勤');
  await expect(page.getByTestId('ai-app-copy-card-video-script')).toContainText('每天通勤');
  await expect(page.getByTestId('ai-app-copy-card-keywords')).toContainText('通勤双肩包');
  await expect(page.getByTestId('ai-app-copy-card-title-options')).not.toContainText('日常小雨和水滴不易渗入');

  await expect(page.getByTestId('ai-app-copy-reveal-title_options')).toBeDisabled();
  await page.getByTestId('ai-app-copy-open-title_options').click();
  await expect(page.getByTestId('ai-app-copy-result-modal')).toContainText('商品标题方案');
  await expect(page.getByTestId('ai-app-copy-result-modal')).toContainText('title_options');
  await page.getByRole('button', { name: '关闭' }).click();

  await page.screenshot({
    path: 'output/playwright/acceptance/phase-2-ecommerce-copywriting.png',
    fullPage: true,
  });
});
