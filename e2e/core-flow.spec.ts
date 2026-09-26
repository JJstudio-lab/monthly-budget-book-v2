import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('synthetic user can record an expense, set a budget, search, and stay isolated', async ({ page }) => {
  await page.getByRole('button', { name: '使用者 A' }).click();
  await expect(page.getByRole('heading', { name: '收支總覽' })).toBeVisible();

  await page.getByRole('button', { name: '新增明細' }).first().click();
  await page.getByLabel('金額').fill('360');
  await page.getByLabel('備註').fill('E2E 測試午餐');
  await page.getByRole('button', { name: '新增明細' }).last().click();
  await expect(page.getByText('E2E 測試午餐')).toBeVisible();

  await page.getByRole('button', { name: '月預算' }).first().click();
  await page.getByLabel('本月預算金額').fill('9000');
  await page.getByRole('button', { name: '儲存預算' }).click();
  await expect(page.getByText('預算已儲存')).toBeVisible();
  await expect(page.getByText(/剩餘/).last()).toContainText('8,640');

  await page.getByRole('button', { name: '收支明細' }).first().click();
  await page.getByLabel('搜尋明細').fill('午餐');
  await expect(page.getByText('E2E 測試午餐')).toBeVisible();
  await page.getByLabel('搜尋明細').fill('找不到的字');
  await expect(page.getByText('還沒有符合條件的明細')).toBeVisible();

  await page.getByRole('button', { name: '登出' }).click();
  await page.getByRole('button', { name: '使用者 B' }).click();
  await page.getByRole('button', { name: '收支明細' }).first().click();
  await page.getByLabel('搜尋明細').fill('E2E 測試午餐');
  await expect(page.getByText('還沒有符合條件的明細')).toBeVisible();
});
