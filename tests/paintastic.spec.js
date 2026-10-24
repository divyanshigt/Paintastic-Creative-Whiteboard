
const { test, expect } = require('@playwright/test');

test('Paintastic website should load successfully', async ({ page }) => {
  await page.goto('https://glowing-toffee-7a21e5.netlify.app/');

  await expect(page).toHaveTitle(/Paintastic/i);
});

test('Paintastic editor should contain a canvas', async ({ page }) => {
  await page.goto('https://glowing-toffee-7a21e5.netlify.app/editor');

  const canvas = page.locator('canvas');
  await expect(canvas.first()).toBeVisible();
});
