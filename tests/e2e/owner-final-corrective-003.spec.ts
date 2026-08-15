import { expect, test, type Page } from '@playwright/test';
import { demoSnapshot } from '../../src/data/demo-snapshot.ts';

const fixture = {
  ...demoSnapshot,
  messages: [{
    id: 'owner-003-public-message',
    type: 'OFFICIAL_NOTICE' as const,
    title: 'Comunicación pública de prueba',
    body: 'Canal público accesible sin inicio de sesión.',
    sourceId: 'owner-003',
    geographicScope: ['Santa Fe'],
    createdAt: '2026-08-03T00:30:00.000Z',
    expiresAt: '2026-08-03T03:30:00.000Z',
    priority: 2 as const,
    status: 'ACTIVE' as const,
    evidenceRefs: [],
    provenance: { producer: 'SOS-SF QA', sourceKind: 'TEST', capturedAt: '2026-08-03T00:30:00.000Z' },
  }],
};

async function installFixture(page: Page) {
  await page.route('**/api/snapshot*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: fixture }),
  }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { enabled: false, reportingEnabled: true, googleClientId: null } }),
  }));
  await page.route('**/api/session*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { authenticated: false, principal: null } }),
  }));
}

async function expectTitleGeometry(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  const title = page.getByRole('heading', { level: 1, name: 'Situación hidrométrica' });
  await expect(title).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Ríos de Santa Fe' })).toHaveCount(0);
  const metrics = await title.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const card = node.closest('.muni-hydrometric-hero')?.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      cardLeft: card?.left ?? 0,
      cardRight: card?.right ?? 0,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(metrics.cardLeft - .5);
  expect(metrics.right).toBeLessThanOrEqual(metrics.cardRight + .5);
  expect(metrics.bottom).toBeGreaterThan(metrics.top);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
}

test('OWNER 003 restores communications across mobile and desktop with focus return', async ({ page }) => {
  await installFixture(page);

  for (const [width, height] of [[320, 568], [390, 844], [430, 932]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const dockMore = page.locator('.mobile-dock').getByRole('button', { name: 'Más' });
    await expect(dockMore).toBeVisible();
    await dockMore.click();
    const communications = page.locator('#civic-mobile-menu').getByRole('button', { name: /Comunicaciones/ });
    await expect(communications).toBeVisible();
    const box = await communications.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    await expect(communications.locator('.sr-only')).toContainText('1 mensaje sin leer');

    await communications.click();
    const dialog = page.locator('dialog.messages-panel');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Comunicaciones públicas' })).toBeVisible();
    await expect(dialog.getByText('Comunicación pública de prueba')).toBeVisible();
    await expect(dialog.getByText(/Funciones privadas no activadas/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.mobile-dock').getByRole('button', { name: 'Más' })).toBeVisible();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const desktop = page.getByRole('button', { name: /Abrir comunicaciones/ });
  await expect(desktop).toBeVisible();
  await expect(desktop.locator('.ui-icon-button__badge')).toHaveText('1');
  await desktop.click();
  const dialog = page.locator('dialog.messages-panel');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(desktop).toBeFocused();
});

test('OWNER 004 title survives mobile widths and 200 percent layout equivalent', async ({ page }) => {
  await installFixture(page);
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]] as const) {
    await expectTitleGeometry(page, width, height);
  }
});
