import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('connections: permissions, one-time credential, responsive form, rename and revocation', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const token = `mnv_visual00.${'V'.repeat(43)}`;
  let connections: Array<Record<string, unknown>> = [];
  await page.route('**/api/connections*', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') { await route.fulfill({ json: { data: request.url().includes('activity=') ? [] : connections } }); return; }
    const body = request.postDataJSON();
    if (body.action === 'create') {
      const connection = { id: '08fc8f40-9621-431a-b892-7174079ebd83', name: body.name, permission: body.permission, token_prefix: 'mnv_visual00', created_at: new Date().toISOString(), expires_at: body.expiresAt, revoked_at: null, last_used_at: null };
      connections = [connection];
      await route.fulfill({ json: { data: connection, token, apiUrl: 'https://moneva-three.vercel.app/api/v1' } }); return;
    }
    connections = connections.map((connection) => ({ ...connection, ...(body.action === 'rename' ? { name: body.name } : { revoked_at: new Date().toISOString() }) }));
    await route.fulfill({ json: { data: { saved: true } } });
  });
  await page.route('**/api/v1/guide', (route) => route.fulfill({ contentType: 'text/markdown', body: '# Moneva\nGuía pública sin credenciales.' }));
  await page.goto('/ajustes');
  const section = page.locator('#conexiones');
  await expect(section.getByText('Tú decides quién puede entrar')).toBeVisible();
  await section.getByRole('button', { name: 'Crear conexión' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Crear conexión' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Solo lectura/ })).toBeChecked();
  await dialog.getByLabel('Nombre', { exact: true }).fill('Asistente personal para mis finanzas y reportes');
  await dialog.getByRole('radio', { name: /Acceso total/ }).check();
  await expect(dialog.getByText(/Podrá eliminar movimientos/)).toBeVisible();
  await dialog.getByRole('radio', { name: /Lectura y modificación/ }).check();
  const viewport = page.viewportSize()!;
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  if (viewport.width < 640) expect(bounds!.height).toBeGreaterThanOrEqual(viewport.height - 1);
  const audit = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('connection-form.png'), fullPage: false, animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Crear token', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Tu conexión está lista' })).toBeVisible();
  await expect(dialog.getByLabel('Token privado', { exact: true })).toHaveAttribute('type', 'password');
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Credencial privada', exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('moneva-credential.private.json');
  await page.screenshot({ path: testInfo.outputPath('connection-issued.png'), fullPage: false, animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Listo, guardé mi conexión' }).click();
  await expect(dialog).not.toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain(token);
  await expect(section.getByText('Asistente personal para mis finanzas y reportes', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Renombrar' }).click();
  await section.getByLabel('Nombre de la conexión').fill('Mi agente');
  await section.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(section.getByText('Mi agente', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Revocar', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revocar acceso' }).click();
  await expect(section.getByText(/Lectura y modificación · Revocada/)).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('connection-section.png'), fullPage: false, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('API public boundary returns JSON rather than a login redirect', async ({ request }) => {
  const response = await request.get('/api/v1/capabilities', { maxRedirects: 0 });
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe('unauthorized');
  const client = await request.get('/integrations/moneva-client.mjs');
  expect(client.status()).toBe(200);
  expect(await client.text()).toContain('redirect: \'error\'');
});

test('dark and reduced-motion form keeps focus, draft and readable error feedback', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.route('**/api/connections*', (route) => route.request().method() === 'GET'
    ? route.fulfill({ json: { data: [] } })
    : route.fulfill({ status: 401, json: { error: { message: 'Vuelve a verificar tu cuenta de Google para crear una conexión.' } } }));
  await page.goto('/ajustes');
  const create = page.locator('#conexiones').getByRole('button', { name: 'Crear conexión' });
  await create.click();
  const dialog = page.getByRole('dialog');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await dialog.getByLabel('Nombre', { exact: true }).fill('Mi conexión de prueba');
  await dialog.getByRole('button', { name: 'Crear token', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Vuelve a verificar');
  await expect(dialog.getByLabel('Nombre', { exact: true })).toHaveValue('Mi conexión de prueba');
  await expect(dialog.getByRole('button', { name: 'Verificar con Google' })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('connection-dark-error.png'), animations: 'disabled', fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  // Explicitly focusable after repeated close/open cycles; no lingering scroll lock.
  for (let i = 0; i < 4; i++) { await create.click(); await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); }
  await expect(create).toBeEnabled();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
