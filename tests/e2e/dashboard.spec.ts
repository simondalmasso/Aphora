import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeAll(async () => {
  await mkdir('artifacts/v1/screenshots', { recursive: true });
});

test('dashboard communicates status, change, source, contradiction and action', async ({ page }, testInfo) => {
  const thirdParty: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) thirdParty.push(url.href);
  });
  await page.goto('/');
  await expect(page.getByText('DEMO / NO OFICIAL', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vigilancia demostrativa' })).toBeVisible();
  await expect(page.getByText('Qué hacer ahora', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué cambió' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fuentes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Señales en tensión' })).toBeVisible();
  await expect(page.locator('nav, [aria-label*="menú" i]')).toHaveCount(0);
  expect(thirdParty).toEqual([]);
  const path = testInfo.project.name === 'mobile' ? 'artifacts/v1/screenshots/mobile.png' : 'artifacts/v1/screenshots/desktop.png';
  await page.screenshot({ path, fullPage: true });
});

test('mobile has no horizontal overflow and keeps action in the first viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only layout assertion');
  await page.goto('/');
  const widths = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
  const action = await page.getByText('Qué hacer ahora', { exact: true }).boundingBox();
  expect(action).not.toBeNull();
  expect(action!.y + action!.height).toBeLessThan(851);
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(pageHeight).toBeLessThanOrEqual(851 * 3.15);
});

test('source details use an accessible modal and keyboard close', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ver evidencia/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Fuentes y vigencia' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('lite is textual, read-only and script-free', async ({ page }) => {
  await page.goto('/lite');
  await expect(page.getByRole('heading', { name: 'Vigilancia demostrativa' })).toBeVisible();
  await expect(page.getByText('Esta pantalla no necesita JavaScript.')).toBeVisible();
  await expect(page.locator('script, textarea, form')).toHaveCount(0);
});

test('PWA shell and snapshot remain explicit while offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Snapshot offline', { exact: true })).toBeVisible();
  await expect(page.getByText('No es el estado actual.', { exact: false })).toBeVisible();
  await context.setOffline(false);
});
