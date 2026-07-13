import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { completeSetup, expect, test } from './fixtures/electron';

test('skill marketplace renders commercial-use source cards with search', async ({ page }) => {
  await completeSetup(page);

  await page.getByTestId('sidebar-nav-skills').click();
  await expect(page.getByTestId('skills-page')).toBeVisible();
  await expect(page.getByTestId('skills-marketplace-title')).toHaveText('Skill Marketplace');
  await expect(page.getByTestId('skills-marketplace-category-hot')).toBeVisible();
  await expect(page.getByTestId('skills-marketplace-grid').locator('[data-testid^="skill-marketplace-card-"]')).toHaveCount(9);
  await expect(page.getByTestId('skill-marketplace-status-spec-driven-development')).not.toHaveText('Installed');
  await expect(page.getByTestId('skills-marketplace-grid')).toContainText('Canvasland verified');
  await expect(page.getByTestId('skills-marketplace-grid')).not.toContainText('github.com');
  await expect(page.getByTestId('skills-marketplace-grid')).not.toContainText('addyosmani/agent-skills');
  await expect(page.getByTestId('skills-marketplace-manage')).toHaveCount(0);
  await expect(page.getByTestId('skills-marketplace-admin-sheet')).toHaveCount(0);
  await expect(page.locator('[data-testid^="skill-marketplace-action-"]').filter({ hasText: 'Install' }).first()).toBeVisible();
  await expect(page.getByTestId('skill-marketplace-action-spec-driven-development')).toHaveText('Install');
  await mkdir(resolve('output/playwright/acceptance'), { recursive: true });
  await page.screenshot({ path: resolve('output/playwright/acceptance/skills-marketplace-taoclaw-style.png'), fullPage: true });

  await page.getByTestId('skill-marketplace-card-security-and-hardening').click();
  await expect(page.getByTestId('skills-marketplace-detail')).toBeVisible();
  await expect(page.getByTestId('skills-marketplace-detail')).toContainText('Skill details');
  await expect(page.getByTestId('skills-marketplace-detail')).toContainText('Security and Hardening');
  await expect(page.getByTestId('skills-marketplace-detail')).toContainText('Requirements');
  await expect(page.getByTestId('skills-marketplace-detail')).toContainText('Entry Point');
  await expect(page.getByTestId('skills-marketplace-detail-action')).toHaveText('Install');
  await expect(page.getByTestId('skills-marketplace-detail')).not.toContainText('GitHub');
  await expect(page.getByTestId('skills-marketplace-detail')).not.toContainText('github.com');
  await page.screenshot({ path: resolve('output/playwright/acceptance/skills-marketplace-detail.png'), fullPage: true });

  await page.getByTestId('skills-marketplace-detail-action').click();
  await expect(page.getByTestId('skills-marketplace-detail-action')).toContainText('Use', { timeout: 30_000 });
  await expect(page.getByTestId('skills-marketplace-detail')).toContainText('.openclaw');
  await expect(page.getByTestId('skills-marketplace-detail-risk')).toContainText('only downloads the skill and never executes');
  await expect(page.getByTestId('skills-marketplace-detail-risk')).toContainText('npm');
  await page.screenshot({ path: resolve('output/playwright/acceptance/skills-marketplace-installed-risk.png'), fullPage: true });
  await page.getByTestId('skills-marketplace-detail-close').click();
  await expect(page.getByTestId('skills-marketplace-detail')).toHaveCount(0);

  await page.getByTestId('skills-marketplace-category-installed').click();
  await expect(page.getByTestId('skills-marketplace-grid').locator('[data-testid^="skill-marketplace-card-"]')).toHaveCount(1);
  await expect(page.getByTestId('skill-marketplace-card-security-and-hardening')).toBeVisible();
  await expect(page.getByTestId('skill-marketplace-action-security-and-hardening')).toHaveText('Use');
  await page.getByTestId('skill-marketplace-uninstall-security-and-hardening').click();
  await expect(page.getByTestId('skill-marketplace-card-security-and-hardening')).toHaveCount(0);

  await page.getByTestId('skills-marketplace-category-all').click();
  await page.getByTestId('skills-marketplace-search').fill('security');
  await expect(page.getByTestId('skill-marketplace-card-security-and-hardening')).toBeVisible();
  await expect(page.getByTestId('skill-marketplace-action-security-and-hardening')).toHaveText('Install');
});

test('skill marketplace hides operator-only management from users', async ({ page }) => {
  await completeSetup(page);

  await page.getByTestId('sidebar-nav-skills').click();
  await expect(page.getByTestId('skills-page')).toBeVisible();
  await expect(page.getByTestId('skills-marketplace-manage')).toHaveCount(0);
  await expect(page.getByTestId('skills-marketplace-admin-sheet')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('GitHub');
  await expect(page.locator('body')).not.toContainText('github.com');
  await page.waitForTimeout(700);

  await mkdir(resolve('output/playwright/acceptance'), { recursive: true });
  await page.screenshot({ path: resolve('output/playwright/acceptance/skills-marketplace-user-only.png'), fullPage: true });
});
