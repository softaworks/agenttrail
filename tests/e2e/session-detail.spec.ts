import { expect, test } from '@playwright/test';

test.describe('Session Detail', () => {
  test('navigates to session when clicking card', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-card');
    await page.locator('.session-card').first().click();
    await expect(page).toHaveURL(/\/session\//);
  });

  test('shows loading skeleton while session loads', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-card');

    await page.route('**/api/sessions/**', async (route) => {
      const url = new URL(route.request().url());
      const isDetail = /^\/api\/sessions\/[^/]+$/.test(url.pathname);
      if (isDetail) {
        await new Promise((r) => setTimeout(r, 800));
      }
      await route.continue();
    });

    await page.locator('.session-card').first().click();
    await expect(page).toHaveURL(/\/session\//);
    await expect(page.locator('[data-testid="session-loading"]')).toBeVisible();
  });

  test('shows session messages', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-card');
    await page.locator('.session-card').first().click();
    await expect(page.locator('.message')).toHaveCount(2);
  });

  test('pin button is suggestive (label/tooltip)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-card');
    await page.locator('.session-card').first().click();
    await page.waitForSelector('.message');

    const pinButton = page.locator('#pin-button');
    await expect(pinButton).toHaveAttribute('title', /Pin session|Unpin session/);
    await expect(pinButton).toHaveAttribute('aria-label', /Pin session|Unpin session/);
  });

  test('shows live indicator when session is working/awaiting', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-card');
    await page.locator('.session-card').first().click();
    await page.waitForSelector('.message');

    await page.evaluate(() => {
      // @ts-expect-error - global in app.js
      updateDetailLiveIndicator('working');
    });

    const live = page.locator('#detail-live-indicator');
    await expect(live).toBeVisible();
    await expect(live).toHaveClass(/working/);
    await expect(live).toContainText('Live');
  });

  test('prefixes bash commands with $', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.session-card');
    await page.locator('.session-card').first().click();
    await expect(page.locator('.bash-content code')).toContainText('$ echo "hello"');
  });
});
