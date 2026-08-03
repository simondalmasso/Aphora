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
  await expect(page.getByTestId('parana-pulse').getByText('DEMO / NO OFICIAL', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pulso del Paraná' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vigilancia demostrativa' })).toBeVisible();
  await expect(page.getByText('Qué hacer ahora', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué cambió' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fuentes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué puede pasar' })).toBeVisible();
  await expect(page.getByText('MÁS ALTO = MÁS RIESGO', { exact: true })).toBeVisible();
  await expect(page.getByText('CELESTE = OBSERVADO', { exact: true })).toBeVisible();
  await expect(page.getByText('ÁMBAR = PROYECCIÓN', { exact: true })).toBeVisible();
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
  const action = await page.locator('.pulse-action').boundingBox();
  expect(action).not.toBeNull();
  expect(action!.y + action!.height).toBeLessThan(851);
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(pageHeight).toBeLessThanOrEqual(851 * 3.15);
});

test('Paraná pulse exposes bounded rendering budgets, uncertainty and a 2D hourly reading', async ({ page }) => {
  await page.goto('/');
  const pulse = page.getByTestId('parana-pulse');
  await expect(pulse).toHaveAttribute('data-grid-observed', '48x10');
  await expect(pulse).toHaveAttribute('data-grid-projection', '24x16');
  await expect(pulse).toHaveAttribute('data-fps-cap', '30');
  await expect(pulse).toHaveAttribute('data-dpr-cap', '1.5');
  await expect(page.getByText('Variación horaria', { exact: true })).toBeVisible();
  await expect(pulse.locator('.pulse-threshold--evacuacion')).toContainText('Evacuación 4.05 m');
  await expect(pulse.locator('.pulse-threshold--vigilancia')).toContainText('Vigilancia 3.45 m');
  await expect(pulse).toHaveAttribute('data-renderer', /running|static|fallback/);
});

test('SVG fallback remains complete when WebGL is unavailable by policy', async ({ page }) => {
  await page.goto('/?pulseFallback=1');
  const pulse = page.getByTestId('parana-pulse');
  await expect(pulse).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.pulse-fallback')).toBeVisible();
  await expect(page.locator('.pulse-webgl')).toHaveCount(0);
  await expect(page.getByText('Vista SVG de respaldo', { exact: true })).toBeVisible();
});

test('reduced motion renders a static visual and never requires animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const pulse = page.getByTestId('parana-pulse');
  await expect(pulse).toHaveAttribute('data-motion', 'reduced');
  await expect(pulse).toHaveAttribute('data-renderer', /static|fallback/);
});

test('source details use an accessible modal and keyboard close', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ver evidencia/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Fuentes y vigencia' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('header actions refresh concurrently and open the public message center without login', async ({ page }) => {
  await page.goto('/');
  const update = page.getByRole('button', { name: 'Actualizar datos' });
  await update.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Última actualización correcta:/)).toBeVisible();

  const messagesButton = page.getByRole('button', { name: /Abrir comunicaciones/ });
  await messagesButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Comunicaciones' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Comunicaciones públicas' })).toBeVisible();
  await expect(dialog.getByText('Disponible cuando se configure.')).toBeVisible();
  await expect(dialog.getByText('No reemplaza al 911', { exact: false })).toBeVisible();
  await expect(dialog.locator('textarea, script[src*="accounts.google.com"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(messagesButton).toBeFocused();
});

test('lite is textual, read-only and script-free', async ({ page }) => {
  await page.goto('/lite');
  await expect(page.getByRole('heading', { name: 'Vigilancia demostrativa' })).toBeVisible();
  await expect(page.getByText('Esta pantalla no necesita JavaScript.')).toBeVisible();
  await expect(page.locator('script, textarea, form')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
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
