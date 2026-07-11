import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { completeSetup, expect, installIpcMocks, test } from './fixtures/electron';

test.describe('AI apps page', () => {
  test('shows ecommerce AI apps by default with search and category filters', async ({ page, electronApp, homeDir }) => {
    await completeSetup(page);
    const referencePath = join(homeDir, 'reference-product.png');
    const referenceBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
    await writeFile(referencePath, Buffer.from(referenceBase64, 'base64'));
    await installIpcMocks(electronApp, {
      hostApi: {
        [`["dialog","open",{"filters":[{"extensions":["png","jpg","jpeg","webp"],"name":"Image files"}],"properties":["openFile"],"title":"Select reference image"}]`]: {
          canceled: false,
          filePaths: [referencePath],
        },
        [`["files","stagePaths",{"allowedExtensions":["png","jpg","jpeg","webp"],"filePaths":[${JSON.stringify(referencePath)}]}]`]: [{
          id: 'e2e-reference-image',
          fileName: 'reference-product.png',
          mimeType: 'image/png',
          fileSize: 68,
          stagedPath: referencePath,
          preview: `data:image/png;base64,${referenceBase64}`,
        }],
      },
    });

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
    await page.getByTestId('ai-app-copy-product-name').fill('AirFlow commuter backpack');
    await page.getByTestId('ai-app-copy-selling-points').fill('Lightweight, water resistant, separate laptop compartment');
    await page.getByTestId('ai-app-copy-platform').selectOption('jd');
    await page.getByTestId('ai-app-copy-brand-tone').fill('Professional and trustworthy');
    await page.getByTestId('ai-app-copy-target-audience').fill('Urban commuters');
    await page.getByTestId('ai-app-copy-use-scene').fill('Daily commute and short business trips');
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-result')).toContainText('Generation job created');
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('Completed', { timeout: 4_000 });
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Product title candidates');
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Detail page copy block');
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Open result');
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Reveal file');
    await expect(page.getByTestId('ai-app-generated-copy')).toContainText('Acceptance runner output');
    await page.getByTestId('ai-app-generated-assets').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-workbench-copywriting.png', fullPage: true });
    await page.getByTestId('ai-app-workbench-back').click();
    await expect(page.getByTestId('ai-apps-grid').locator('[data-testid^="ai-app-card-"]')).toHaveCount(3);

    await page.getByTestId('ai-app-card-detail-poster-generator').click();
    await expect(page.getByTestId('ai-app-workbench-title')).toHaveText('Detail Image / Poster Generator');
    await expect(page.getByTestId('ai-app-workbench-form')).toContainText('Reference images');
    await page.getByTestId('ai-app-reference-upload').click();
    await expect(page.getByTestId('ai-app-reference-preview')).toBeVisible();
    await expect(page.getByTestId('ai-app-reference-file')).toContainText('reference-product.png');
    await expect(page.getByTestId('ai-app-reference-file')).toContainText('68 B');
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-detail-poster-reference-upload.png', fullPage: true });
    await page.getByTestId('ai-app-reference-remove').click();
    await expect(page.getByTestId('ai-app-reference-upload')).toBeVisible();
    await page.getByTestId('ai-app-reference-upload').click();
    await page.getByTestId('ai-app-product-description').fill('Create a clean ecommerce detail poster');
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('Completed', { timeout: 4_000 });
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Detail image section');
    await expect(page.getByTestId('ai-app-generated-assets')).toContainText('Long detail poster');
    await expect(page.getByTestId('image-preview').first()).toBeVisible();
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-detail-poster-reference.png', fullPage: true });
    await page.getByTestId('ai-app-workbench-back').click();

    await page.getByTestId('ai-app-card-product-short-video').click();
    await expect(page.getByTestId('ai-app-workbench-title')).toHaveText('Product Short Video Generator');
    await expect(page.getByTestId('ai-app-workbench-form')).toContainText('Generation mode');
    await expect(page.getByTestId('ai-app-video-provider-capability')).toContainText('Acceptance Video Provider');
    await page.getByTestId('ai-app-video-product-text').fill('Lightweight commuter backpack made from water-resistant recycled fabric');
    await page.getByTestId('ai-app-video-selling-points').fill('Separate laptop compartment, breathable straps, quick-access pocket');
    await page.getByTestId('ai-app-video-platform').selectOption('douyin');
    await page.getByTestId('ai-app-ratio-9-16').click();
    await page.getByTestId('ai-app-video-model-seedance-2.0-pro').click();
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('Queued');
    await expect(page.getByTestId('ai-app-local-job-id')).toContainText('aiapp-product-short-video-');
    await expect(page.getByTestId('ai-app-provider-task-id')).toContainText('provider-video-task-001');
    await expect(page.getByTestId('ai-app-raw-response')).toContainText('queued');
    await page.getByTestId('ai-app-refresh-video-status').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('Completed');
    await expect(page.getByTestId('ai-app-video-result')).toContainText('https://example.com/product-video.mp4');
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
    await page.getByTestId('ai-app-copy-product-name').fill('轻量通勤双肩包');
    await page.getByTestId('ai-app-copy-selling-points').fill('防泼水面料、独立电脑仓、轻量背负');
    await page.getByTestId('ai-app-copy-platform').selectOption('taobao');
    await page.getByTestId('ai-app-copy-brand-tone').fill('专业可信、自然克制');
    await page.getByTestId('ai-app-copy-target-audience').fill('城市通勤人群');
    await page.getByTestId('ai-app-copy-use-scene').fill('日常通勤、短途出差');
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('已完成', { timeout: 4_000 });
    await expect(page.getByTestId('ai-app-generated-copy')).toContainText('Acceptance runner output');
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
    await page.getByTestId('ai-app-video-product-text').fill('轻量通勤双肩包，采用防泼水再生面料');
    await page.getByTestId('ai-app-video-selling-points').fill('独立电脑仓、透气肩带、快速取物袋');
    await page.getByTestId('ai-app-video-platform').selectOption('xiaohongshu');
    await page.getByTestId('ai-app-ratio-9-16').click();
    await page.getByTestId('ai-app-create-demo-job').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('排队中');
    await expect(page.getByTestId('ai-app-provider-task-id')).toContainText('provider-video-task-001');
    await page.getByTestId('ai-app-refresh-video-status').click();
    await expect(page.getByTestId('ai-app-demo-job-status')).toContainText('已完成');
    await expect(page.getByTestId('ai-app-video-result')).toContainText('https://example.com/product-video.mp4');
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-short-video-workbench-zh.png', fullPage: true });
    await page.getByTestId('ai-app-video-model-seedance-2.0-720p').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/acceptance/ai-apps-short-video-model-selection-zh.png', fullPage: true });
  });
});
