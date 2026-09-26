import { expect, test } from '@playwright/test';

const password = 'Local-only-E2E-Password-2468';
const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `category-budget-${id}@example.test`;

 test('Local Supabase category budgets support create, update, spend totals, and delete', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立帳號' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('密碼').fill(password);
  await page.locator('form').getByRole('button', { name: '建立帳號' }).click();

  page.once('dialog', (dialog) => dialog.accept(`Category Budget ${id}`));
  await page.getByRole('button', { name: '建立我的帳本' }).click();
  await expect(page.getByRole('heading', { name: '收支總覽' })).toBeVisible();

  await page.getByRole('button', { name: '新增明細' }).first().click();
  await page.getByLabel('金額').fill('350');
  await page.getByLabel('備註').fill('分類預算測試支出');
  await page.locator('[role="dialog"]').getByRole('button', { name: '新增明細' }).click();
  await expect(page.getByText('分類預算測試支出')).toBeVisible();

  await page.getByRole('button', { name: '月預算' }).first().click();
  await page.getByLabel('本月預算金額').fill('2000');
  await page.getByRole('button', { name: '儲存預算' }).click();
  await page.getByLabel('預算分類').selectOption({ label: '餐飲' });
  await page.getByLabel('分類預算金額', { exact: true }).fill('250');
  await page.getByRole('button', { name: '新增分類預算' }).click();
  const foodBudget = page.locator('[data-testid^="category-budget-"]').filter({ hasText: '餐飲' });
  await expect(foodBudget).toContainText('250');
  await expect(foodBudget).toContainText('350');
  await expect(foodBudget).toContainText('-$100');
  await expect(foodBudget).toContainText('140%');

  await page.getByRole('button', { name: '總覽' }).first().click();
  const homepageBudget = page.locator('.budget-panel');
  await expect(homepageBudget).toContainText('總預算');
  await expect(homepageBudget).toContainText('$2,000');
  await expect(homepageBudget).toContainText('$350');
  await expect(homepageBudget).toContainText('$1,650');
  await expect(homepageBudget).toContainText('18%');
  await expect(homepageBudget).toContainText('餐飲');
  await expect(homepageBudget).toContainText('已超支 · 140%');

  await page.getByRole('button', { name: '月預算' }).first().click();
  await page.reload();
  await page.getByRole('button', { name: '月預算' }).first().click();
  const persistedFoodBudget = page.locator('[data-testid^="category-budget-"]').filter({ hasText: '餐飲' });
  await expect(persistedFoodBudget).toContainText('140%');
  await persistedFoodBudget.getByLabel('分類預算金額 餐飲').fill('700');
  await persistedFoodBudget.getByRole('button', { name: '儲存' }).click();
  await expect(persistedFoodBudget).toContainText('700');
  await expect(persistedFoodBudget).toContainText('350');
  await expect(persistedFoodBudget).toContainText('50%');

  page.once('dialog', (dialog) => dialog.accept());
  await persistedFoodBudget.getByRole('button', { name: '刪除' }).click();
  await expect(page.getByText('本月尚未設定分類預算')).toBeVisible();
});

test('Local Supabase homepage keeps the category budget empty state clean', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立帳號' }).click();
  await page.getByLabel('Email').fill(`homepage-empty-${id}@example.test`);
  await page.getByLabel('密碼').fill(password);
  await page.locator('form').getByRole('button', { name: '建立帳號' }).click();
  page.once('dialog', (dialog) => dialog.accept(`Homepage Empty ${id}`));
  await page.getByRole('button', { name: '建立我的帳本' }).click();
  await expect(page.getByRole('heading', { name: '收支總覽' })).toBeVisible();
  const homepageBudget = page.locator('.budget-panel');
  await expect(homepageBudget).toContainText('$0');
  await expect(homepageBudget).toContainText('使用比例');
  await expect(homepageBudget).toContainText('尚未設定分類預算');
});
