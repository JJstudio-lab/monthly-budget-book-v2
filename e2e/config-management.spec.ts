import { expect, test } from '@playwright/test';

test('categories and payment methods are editable, sortable, and deactivatable', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '使用者 A' }).click();
  await page.getByRole('button', { name: '帳本設定' }).first().click();

  const categoryName = page.getByLabel('新增收支分類');
  await categoryName.fill('寵物');
  await categoryName.press('Enter');
  await expect(page.getByLabel('編輯名稱 寵物')).toBeVisible();

  const methodName = page.getByLabel('新增付款方式');
  await methodName.fill('悠遊卡');
  await methodName.press('Enter');
  await expect(page.getByLabel('編輯名稱 悠遊卡')).toBeVisible();

  const editableMethod = page.getByLabel('編輯名稱 悠遊卡');
  await editableMethod.fill('交通卡');
  await editableMethod.press('Enter');
  await expect(page.getByLabel('編輯名稱 交通卡')).toBeVisible();
  const methodSort = page.getByLabel('排序 交通卡');
  await methodSort.fill('5');
  await expect(methodSort).toHaveValue('5');
  await page.getByRole('button', { name: '停用 交通卡' }).click();
  await expect(page.getByRole('button', { name: '啟用 交通卡' })).toBeVisible();

  const editableCategory = page.getByLabel('編輯名稱 寵物');
  await editableCategory.fill('毛孩');
  await editableCategory.press('Enter');
  await expect(page.getByLabel('編輯名稱 毛孩')).toBeVisible();
  const categorySort = page.getByLabel('排序 毛孩');
  await categorySort.fill('5');
  await expect(categorySort).toHaveValue('5');
  await page.getByRole('button', { name: '停用 毛孩' }).click();
  await expect(page.getByRole('button', { name: '啟用 毛孩' })).toBeVisible();
});
