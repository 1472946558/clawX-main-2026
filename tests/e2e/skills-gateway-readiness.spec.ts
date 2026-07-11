import { completeSetup, expect, test } from './fixtures/electron';

test.describe('AI apps page', () => {
  test('shows ecommerce AI apps by default with search and category filters', async ({ page }) => {
    await completeSetup(page);

    await page.getByTestId('sidebar-nav-ai-apps').click();
    await expect(page.getByTestId('skills-page')).toBeVisible();
    await expect(page.getByTestId('ai-apps-title')).toHaveText('AI Apps');
    await expect(page.getByTestId('ai-apps-category-tabs')).toBeVisible();

    await expect(page.getByTestId('ai-apps-category-all')).toBeVisible();
    await expect(page.getByTestId('ai-apps-category-ecommerce')).toBeVisible();
    await expect(page.getByTestId('ai-apps-category-media')).toBeVisible();
    await expect(page.getByTestId('ai-apps-category-tools')).toBeVisible();
    await expect(page.getByTestId('ai-apps-category-finance')).toBeVisible();
    await expect(page.getByTestId('ai-apps-category-goddess')).toBeVisible();

    await expect(page.getByTestId('ai-apps-grid').locator('[data-testid^="ai-app-card-"]')).toHaveCount(3);
    await expect(page.getByTestId('ai-app-card-ecommerce-copywriting')).toContainText('Ecommerce Copy Generator');
    await expect(page.getByTestId('ai-app-card-detail-poster-generator')).toContainText('Detail Image / Poster Generator');
    await expect(page.getByTestId('ai-app-card-product-short-video')).toContainText('Product Short Video Generator');
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-page.png', fullPage: true });

    await page.getByTestId('ai-app-card-ecommerce-copywriting').click();
    await expect(page.getByTestId('ai-app-workbench')).toBeVisible();
    await expect(page.getByTestId('ai-app-workbench-title')).toHaveText('Ecommerce Copy Generator');
    await expect(page.getByTestId('ai-app-workbench-form')).toContainText('Product name');
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-result')).toContainText('Generation job created');
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('Completed', { timeout: 4_000 });
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Product title candidates');
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Detail page copy block');
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Open result');
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Reveal file');
    await page.getByTestId('ai-app-generated-assets').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-workbench-copywriting.png', fullPage: true });
    await page.getByTestId('ai-app-workbench-back').click();
    await expect(page.getByTestId('ai-apps-grid').locator('[data-testid^="ai-app-card-"]')).toHaveCount(3);

    await page.getByTestId('ai-app-card-detail-poster-generator').click();
    await expect(page.getByTestId('ai-app-workbench-title')).toHaveText('Detail Image / Poster Generator');
    await expect(page.getByTestId('ai-app-workbench-form')).toContainText('Reference images');
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('Completed', { timeout: 4_000 });
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Detail image section');
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Long detail poster');
    await page.getByTestId('ai-app-workbench-back').click();

    await page.getByTestId('ai-app-card-product-short-video').click();
    await expect(page.getByTestId('ai-app-workbench-title')).toHaveText('Product Short Video Generator');
    await expect(page.getByTestId('ai-app-workbench-form')).toContainText('Generation mode');
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('Completed', { timeout: 4_000 });
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Product video storyboard');
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Video cover frame');
    await page.getByTestId('ai-app-workbench-back').click();

    await page.getByTestId('ai-apps-search').fill('short');
    await expect(page.getByTestId('ai-apps-grid').locator('[data-testid^="ai-app-card-"]')).toHaveCount(1);
    await expect(page.getByTestId('ai-app-card-product-short-video')).toBeVisible();

    await page.getByLabel('Clear search').click();
    await expect(page.getByTestId('ai-apps-grid').locator('[data-testid^="ai-app-card-"]')).toHaveCount(3);

    await page.getByTestId('ai-apps-category-media').click();
    await expect(page.getByText('Apps for this category are being planned')).toBeVisible();

    await page.getByTestId('ai-apps-category-all').click();
    await expect(page.getByTestId('ai-apps-grid').locator('[data-testid^="ai-app-card-"]')).toHaveCount(3);
  });

  test('captures Chinese ecommerce AI app acceptance screenshots', async ({ page }) => {
    await completeSetup(page);

    await page.getByTestId('sidebar-nav-settings').click();
    await page.getByRole('button', { name: '中文' }).click();
    await expect(page.getByText('菜单语言已更新')).toBeVisible();

    await page.getByTestId('sidebar-nav-ai-apps').click();
    await expect(page.getByTestId('ai-apps-title')).toHaveText('AI应用');
    await expect(page.getByTestId('ai-apps-category-tabs')).toContainText('全部应用');
    await expect(page.getByTestId('ai-apps-category-tabs')).toContainText('电商');
    await expect(page.getByTestId('ai-apps-grid').locator('[data-testid^="ai-app-card-"]')).toHaveCount(3);
    await expect(page.getByTestId('ai-app-card-ecommerce-copywriting')).toContainText('电商文案生成');
    await expect(page.getByTestId('ai-app-card-detail-poster-generator')).toContainText('详情图/详情海报生成');
    await expect(page.getByTestId('ai-app-card-product-short-video')).toContainText('商品短视频生成');
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-page-zh.png', fullPage: true });

    await page.getByTestId('ai-app-card-ecommerce-copywriting').click();
    await expect(page.getByTestId('ai-app-workbench-title')).toHaveText('电商文案生成');
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('已完成', { timeout: 4_000 });
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-copywriting-workbench-zh.png', fullPage: true });
    await page.getByTestId('ai-app-workbench-back').click();

    await page.getByTestId('ai-app-card-detail-poster-generator').click();
    await expect(page.getByTestId('ai-app-workbench-title')).toHaveText('详情图/详情海报生成');
    await expect(page.getByText('image-01', { exact: true })).toBeVisible();
    await expect(page.getByText('image-01-live', { exact: true })).toBeVisible();
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('已完成', { timeout: 4_000 });
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-detail-poster-workbench-zh.png', fullPage: true });
    await page.getByTestId('ai-app-workbench-back').click();

    await page.getByTestId('ai-app-card-product-short-video').click();
    await expect(page.getByTestId('ai-app-workbench-title')).toHaveText('商品短视频生成');
    await expect(page.getByText('seedance-2.0-720p')).toBeVisible();
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('已完成', { timeout: 4_000 });
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-short-video-workbench-zh.png', fullPage: true });
  });
});
