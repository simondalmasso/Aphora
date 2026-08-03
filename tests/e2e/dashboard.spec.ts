import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeAll(async () => {
  await mkdir('artifacts/v1/screenshots', { recursive: true });
});

test('dashboard prioritizes the Paraná pulse and keeps secondary evidence on demand', async ({ page }, testInfo) => {
  const thirdParty: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) thirdParty.push(url.href);
  });

  await page.goto('/');
  const pulse = page.getByTestId('parana-pulse');
  await expect(pulse.getByText('DEMO / NO OFICIAL', { exact: true })).toBeVisible();
  await expect(page.getByText('DEMO / NO OFICIAL', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Pulso del Paraná' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vigilancia demostrativa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lo importante ahora' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué hacer ahora' })).toBeVisible();
  await expect(page.getByText('MÁS ALTO = MÁS RIESGO', { exact: true })).toBeVisible();
  await expect(page.getByText('CELESTE = OBSERVADO', { exact: true })).toBeVisible();
  await expect(page.getByText('ÁMBAR = PROYECCIÓN', { exact: true })).toBeVisible();
  await expect(page.getByText('Pluviómetro demo Centro', { exact: true })).toBeHidden();
  await expect(page.getByText('Panel en modo demostración', { exact: true })).toBeHidden();
  await expect(page.locator('.demo-banner, .refresh-status, .sources-card, .communications-card')).toHaveCount(0);
  await expect(page.locator('nav, [aria-label*="menú" i]')).toHaveCount(0);
  expect(thirdParty).toEqual([]);

  const path = testInfo.project.name === 'mobile' ? 'artifacts/v1/screenshots/mobile.png' : 'artifacts/v1/screenshots/desktop.png';
  await page.screenshot({ path, fullPage: true });
});

test('first viewport contains status, level, trend, visual and action without horizontal overflow', async ({ page }, testInfo) => {
  await page.goto('/');
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const pulse = page.getByTestId('parana-pulse');
  const pulseBox = await pulse.boundingBox();
  expect(pulseBox).not.toBeNull();
  expect(pulseBox!.y).toBeLessThan(80);

  for (const locator of [
    page.getByRole('heading', { name: 'Vigilancia demostrativa' }),
    pulse.locator('.pulse-level'),
    pulse.getByTestId('pulse-trend'),
    pulse.locator('.pulse-visual-shell'),
    pulse.locator('.pulse-action'),
  ]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  }

  const widths = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
  await expect(page.locator('[data-primary-section="true"]')).toHaveCount(2);
  await expect(page.getByTestId('more-information')).not.toHaveAttribute('open', '');
  if (testInfo.project.name === 'mobile') {
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(pageHeight).toBeLessThanOrEqual(viewport!.height * 2.5);
  }
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
  const trigger = page.getByRole('button', { name: 'Ver evidencia', exact: true });
  await expect(page.getByText('Pluviómetro demo Centro', { exact: true })).toBeHidden();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Fuentes y vigencia' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Pluviómetro demo Centro', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Contradicciones' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Cómo leer la incertidumbre' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Estado de la API' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('header actions refresh and open complete communications only on demand', async ({ page }) => {
  await page.goto('/');
  const update = page.getByRole('button', { name: 'Actualizar estado' });
  await update.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Actualizado \d{2} [a-z]{3}, \d{2}:\d{2}/i)).toBeVisible();

  const messagesButton = page.getByRole('button', { name: /Abrir mensajes/ });
  await expect(page.getByText('Panel en modo demostración', { exact: true })).toBeHidden();
  await messagesButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Comunicaciones' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Comunicaciones públicas' })).toBeVisible();
  await expect(dialog.getByText('Panel en modo demostración', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Disponible cuando se configure.')).toBeVisible();
  await expect(dialog.getByText('No reemplaza al 911', { exact: false })).toBeVisible();
  await expect(dialog.locator('textarea, script[src*="accounts.google.com"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(messagesButton).toBeFocused();
});

test('Más información expands by keyboard while inactive shelter locations stay hidden by default', async ({ page }) => {
  await page.goto('/');
  const details = page.getByTestId('more-information');
  const summary = details.locator('summary');
  await expect(details.locator('.places-list')).toBeHidden();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.getByRole('heading', { name: 'Cambios completos' })).toBeVisible();
  await expect(details.getByRole('heading', { name: 'Lluvia detallada' })).toBeVisible();
  await expect(details.getByRole('heading', { name: 'Señales en tensión' })).toBeVisible();
  await expect(details.getByText('No hay refugios activos.', { exact: false })).toBeVisible();
  await expect(details.locator('.places-list')).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.locator('.places-list')).toBeHidden();
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
