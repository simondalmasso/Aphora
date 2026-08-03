import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeAll(async () => {
  await mkdir('artifacts/v1/screenshots', { recursive: true });
});

test('first viewport answers the essential questions and keeps demo status explicit', async ({ page }) => {
  await page.goto('/');
  const pulse = page.getByTestId('parana-pulse');
  await expect(page.getByText('DEMO / NO OFICIAL', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Pulso del Paraná' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vigilancia demostrativa' })).toBeVisible();
  await expect(pulse.locator('.pulse-level')).toContainText('3.42');
  await expect(pulse.getByText('+19 cm', { exact: true })).toBeVisible();
  await expect(pulse.getByTestId('pulse-trend')).toContainText('Ascenso lento');
  await expect(pulse.getByText('48 h observadas · 24 h proyectadas', { exact: true })).toBeVisible();
  await expect(pulse.locator('.pulse-action')).toContainText('Consultá canales oficiales');
  const box = await pulse.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThan(80);
});

test('dashboard exposes exactly three primary modules after the hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-primary-section="true"]')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Ahora', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué hacer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Próximas horas', exact: true })).toBeVisible();
  await expect(page.getByText('Fuentes y vigencia', { exact: true })).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Comunicaciones' })).toBeHidden();
});

test('responsive dashboard has no horizontal overflow at required widths', async ({ page }) => {
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 900 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const widths = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(widths.scrollWidth, `${viewport.width}px overflow`).toBeLessThanOrEqual(widths.clientWidth);
    await expect(page.getByTestId('parana-pulse')).toBeVisible();
  }
});

test('graphs, gauge and textual fallbacks communicate without relying on color', async ({ page }) => {
  await page.goto('/?pulseFallback=1');
  const pulse = page.getByTestId('parana-pulse');
  await expect(pulse).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.pulse-fallback')).toBeVisible();
  await expect(page.getByText('Vista SVG de respaldo', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Vigilancia/i })).toContainText('Faltan');
  await expect(page.getByRole('img', { name: 'Tendencia del río' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Lluvia reciente' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Proyección de nivel' })).toBeVisible();
});

test('bounded Three visual remains lazy, pausable and budgeted', async ({ page }) => {
  await page.goto('/');
  const pulse = page.getByTestId('parana-pulse');
  await expect(pulse).toHaveAttribute('data-grid-observed', '48x10');
  await expect(pulse).toHaveAttribute('data-grid-projection', '24x16');
  await expect(pulse).toHaveAttribute('data-fps-cap', '30');
  await expect(pulse).toHaveAttribute('data-dpr-cap', '1.5');
  await expect(pulse).toHaveAttribute('data-renderer', /running|static|fallback/);
});

test('reduced motion is complete and stable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const pulse = page.getByTestId('parana-pulse');
  await expect(pulse).toHaveAttribute('data-motion', 'reduced');
  await expect(pulse).toHaveAttribute('data-renderer', /static|fallback/);
  const duration = await page.locator('.ui-button').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(duration).toBeLessThan(.02);
});

test('evidence sheet is segmented, keyboard accessible and returns focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Ver evidencia', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Entender los datos' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Fuentes y vigencia' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Datos completos' }).click();
  await expect(dialog.getByRole('heading', { name: 'Datos completos' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Comunicaciones' }).click();
  await expect(dialog.getByText('No es un canal de emergencias.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Modo demo' }).click();
  await expect(dialog.getByText('Fuentes externas: ninguna')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('header icon buttons meet touch size, refresh and messages behavior', async ({ page }) => {
  await page.goto('/');
  const update = page.getByRole('button', { name: 'Actualizar estado' });
  const messages = page.getByRole('button', { name: 'Abrir mensajes' });
  for (const button of [update, messages]) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await update.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Actualizado \d{2} [a-z]{3}, \d{2}:\d{2}/i)).toBeVisible();
  await messages.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Comunicaciones' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Comunicaciones públicas' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(messages).toBeFocused();
});

test('mobile action dock exposes only real actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Acciones rápidas' });
  await expect(dock).toBeVisible();
  await expect(dock.getByText('Qué hacer', { exact: true })).toBeVisible();
  await expect(dock.getByRole('button', { name: 'Evidencia' })).toBeVisible();
  await expect(dock.getByRole('button', { name: 'Compartir' })).toBeVisible();
  await expect(dock.locator('a,button')).toHaveCount(3);
});

test('page makes no third-party requests or external font requests', async ({ page }) => {
  const thirdParty: string[] = [];
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) thirdParty.push(url.href);
    if (request.resourceType() === 'font') fontRequests.push(url.href);
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(thirdParty).toEqual([]);
  expect(fontRequests).toEqual([]);
});

test('desktop, mobile and tablet screenshots are generated', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') {
    await page.goto('/');
    await page.screenshot({ path: 'artifacts/v1/screenshots/mobile.png', fullPage: true });
    return;
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/v1/screenshots/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/v1/screenshots/tablet.png', fullPage: true });
});

test('lite stays textual, read-only and script-free', async ({ page }) => {
  await page.goto('/lite');
  await expect(page.getByRole('heading', { name: 'Vigilancia demostrativa' })).toBeVisible();
  await expect(page.getByText('Esta pantalla no necesita JavaScript.')).toBeVisible();
  await expect(page.locator('script, textarea, form, canvas')).toHaveCount(0);
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
