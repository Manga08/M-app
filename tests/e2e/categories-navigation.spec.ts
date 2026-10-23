import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';

test('categories have their own destination in desktop navigation and mobile More', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole('button', { name: 'Abrir más opciones' }).click();
    await page.getByRole('dialog').getByRole('link', { name: /Categorías/ }).click();
  } else {
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Categorías', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/categorias$/);
  await expect(page.getByRole('heading', { name: 'Categorías', exact: true })).toBeVisible();
  if (page.viewportSize()!.width >= 1024) await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Categorías', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.locator('#categories-tab-income').click();
  await expect(page).toHaveURL(/\/categorias\?vista=ingresos$/);
  await expect(page.getByRole('heading', { name: 'Tipos de ingreso', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  const output = `C:/Users/mangu/.codex/visualizations/2026/10/22/moneva-connections-categories/${info.project.name}`;
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: `${output}/categorias.png`, fullPage: false, animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('old category links keep the selected view without redirect loops', async ({ page }) => {
  await page.goto('/ajustes/categorias?vista=ingresos');
  await expect(page).toHaveURL(/\/categorias\?vista=ingresos$/);
  await expect(page.getByRole('heading', { name: 'Tipos de ingreso', exact: true })).toBeVisible();
  await page.goto('/estructura');
  await expect(page).toHaveURL(/\/categorias$/);
  await expect(page.getByRole('heading', { name: 'Categorías', exact: true })).toBeVisible();
});
