import { expect, test } from '@playwright/test';

test('a newly created demo ledger stays available to its owner after reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '使用者 A' }).click();
  page.once('dialog', (dialog) => dialog.accept('A 的另一個帳本'));
  await page.getByRole('button', { name: '新增帳本' }).click();
  const ledgerPicker = page.getByRole('combobox', { name: '選擇帳本' });
  await expect(ledgerPicker.locator('option', { hasText: 'A 的另一個帳本' })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('combobox', { name: '選擇帳本' }).locator('option', { hasText: 'A 的另一個帳本' })).toHaveCount(1);
  await page.getByRole('button', { name: '登出' }).click();
  await page.getByRole('button', { name: '使用者 B' }).click();
  await expect(page.getByRole('combobox', { name: '選擇帳本' }).locator('option', { hasText: 'A 的另一個帳本' })).toHaveCount(0);
});
