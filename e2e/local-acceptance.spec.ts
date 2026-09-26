import { expect, test, type Page } from '@playwright/test';

const password = 'Local-only-E2E-Password-2468';
const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = new Date().toISOString().slice(0, 10);

async function addTransaction(page: Page, type: 'expense' | 'income', category: string, amount: number, description: string, method = '現金') {
  await page.getByRole('button', { name: '新增明細' }).first().click();
  const dialog = page.locator('[role="dialog"]');
  if (type === 'income') await dialog.getByRole('button', { name: '收入' }).click();
  await dialog.getByLabel('金額').fill(String(amount));
  await dialog.getByLabel('日期').fill(today);
  await dialog.getByLabel('分類').selectOption({ label: category });
  await dialog.getByLabel('付款方式').selectOption({ label: method });
  await dialog.getByLabel('備註').fill(description);
  await dialog.getByRole('button', { name: '新增明細' }).click();
}

async function addCategoryBudget(page: Page, category: string, amount: number) {
  const categorySelect = page.getByLabel('預算分類');
  await categorySelect.selectOption({ label: category });
  await page.getByLabel('分類預算金額', { exact: true }).fill(String(amount));
  await page.getByRole('button', { name: '新增分類預算' }).click();
  const budget = page.locator('[data-testid^="category-budget-"]').filter({ hasText: category });
  await expect(budget).toContainText(`$${amount.toLocaleString('en-US')}`);
}

async function verifyViewport(page: Page, pageKey: string, width: number, height: number, outputPath: string) {
  await page.setViewportSize({ width, height });
  const routeButton = width <= 640
    ? page.locator('.bottom-nav button').filter({ hasText: pageKey === 'overview' ? '總覽' : pageKey === 'records' ? '收支明細' : pageKey === 'budget' ? '月預算' : '帳本設定' })
    : page.locator('.nav-item').filter({ hasText: pageKey === 'overview' ? '總覽' : pageKey === 'records' ? '收支明細' : pageKey === 'budget' ? '月預算' : '帳本設定' });
  await routeButton.click();
  const targetSelector: Record<string, string> = { overview: '.summary-grid', records: '.records-panel', budget: '.budget-editor', settings: '.settings-grid' };
  const metrics = await page.evaluate(({ selector, pageKey }) => {
    const heading = document.querySelector('.page-heading');
    const target = document.querySelector(selector);
    const rect = (element: Element | null) => {
      if (!element) return null;
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    };
    const offenders = Array.from(document.querySelectorAll('.content,.page-heading,.panel,.summary-grid,.overview-grid,.settings-grid,.transaction-row'))
      .filter((element) => element.scrollWidth > element.clientWidth + 2)
      .map((element) => `${(element as HTMLElement).className}:${element.scrollWidth}/${element.clientWidth}`);
    return {
      viewport: window.innerWidth,
      height: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      content: rect(document.querySelector('.content')),
      heading: rect(heading),
      target: rect(target),
      targetColumns: target ? getComputedStyle(target).gridTemplateColumns.split(' ').length : 1,
      primaryColumns: pageKey === 'overview' ? getComputedStyle(document.querySelector('.overview-grid')!).gridTemplateColumns.split(' ').length : pageKey === 'settings' ? getComputedStyle(document.querySelector('.settings-grid')!).gridTemplateColumns.split(' ').length : 1,
      sidebarVisible: !!document.querySelector('.sidebar') && getComputedStyle(document.querySelector('.sidebar')!).display !== 'none',
      mobileNavVisible: !!document.querySelector('.bottom-nav') && getComputedStyle(document.querySelector('.bottom-nav')!).display !== 'none',
      offenders,
    };
  }, { selector: targetSelector[pageKey], pageKey });

  expect(metrics.viewport).toBe(width);
  expect(metrics.height).toBe(height);
  expect(metrics.documentWidth).toBeLessThanOrEqual(width);
  expect(metrics.offenders).toEqual([]);
  expect(metrics.heading).not.toBeNull();
  expect(metrics.target).not.toBeNull();
  expect(Math.abs((metrics.heading as DOMRect).left - (metrics.target as DOMRect).left)).toBeLessThanOrEqual(1);
  if (width <= 640) {
    expect(metrics.sidebarVisible).toBe(false);
    expect(metrics.mobileNavVisible).toBe(true);
    if (pageKey === 'overview' || pageKey === 'settings') expect(metrics.primaryColumns).toBe(1);
  } else {
    expect(metrics.sidebarVisible).toBe(true);
    expect(metrics.mobileNavVisible).toBe(false);
  }
  await page.screenshot({ path: outputPath });
}

test('Local synthetic household data works across finance flows and responsive layouts', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '建立帳號' }).click();
  await page.getByLabel('Email').fill(`local-acceptance-${id}@example.test`);
  await page.getByLabel('密碼').fill(password);
  await page.locator('form').getByRole('button', { name: '建立帳號' }).click();
  page.once('dialog', (dialog) => dialog.accept('真實情境驗收'));
  await page.getByRole('button', { name: '建立我的帳本' }).click();
  await expect(page.getByRole('heading', { name: '收支總覽' })).toBeVisible();

  await addTransaction(page, 'income', '薪資', 55000, '九月薪資入帳', '轉帳');
  await addTransaction(page, 'income', '其他收入', 5000, '接案收入', '轉帳');
  await addTransaction(page, 'expense', '餐飲', 1500, '週末採買');
  await addTransaction(page, 'expense', '餐飲', 500, '午餐便當');
  await addTransaction(page, 'expense', '交通', 1000, '捷運月票', '信用卡');
  await addTransaction(page, 'expense', '交通', 800, '計程車');
  await addTransaction(page, 'expense', '生活', 15000, '九月房租', '轉帳');
  await addTransaction(page, 'expense', '生活', 3000, '日用品');

  await page.getByRole('button', { name: '月預算' }).first().click();
  await page.getByLabel('本月預算金額').fill('30000');
  await page.getByRole('button', { name: '儲存預算' }).click();
  await addCategoryBudget(page, '餐飲', 4000);
  await addCategoryBudget(page, '交通', 1500);
  await addCategoryBudget(page, '生活', 20000);

  await page.getByRole('button', { name: '總覽' }).first().click();
  await expect(page.locator('.summary-card.income')).toContainText('$60,000');
  await expect(page.locator('.summary-card.expense')).toContainText('$21,800');
  await expect(page.locator('.summary-card.balance')).toContainText('$38,200');
  const homeBudget = page.locator('.budget-panel');
  await expect(homeBudget).toContainText('$30,000');
  await expect(homeBudget).toContainText('$21,800');
  await expect(homeBudget).toContainText('$8,200');
  await expect(homeBudget).toContainText('73%');
  await expect(homeBudget.locator('.budget-usage.compact')).toHaveCount(3);
  const homeCategories = homeBudget.locator('.budget-usage.compact');
  await expect(homeCategories.nth(0)).toContainText('交通');
  await expect(homeCategories.nth(0)).toHaveAttribute('data-state', 'over');
  await expect(homeCategories.nth(0)).toContainText('已超支');
  await expect(homeCategories.nth(0)).toContainText('120%');
  await expect(homeCategories.nth(1)).toContainText('生活');
  await expect(homeCategories.nth(1)).toHaveAttribute('data-state', 'near');
  await expect(homeCategories.nth(1)).toContainText('接近預算');
  await expect(homeCategories.nth(1)).toContainText('90%');
  await expect(homeCategories.nth(2)).toContainText('餐飲');
  await expect(homeCategories.nth(2)).toHaveAttribute('data-state', 'normal');
  await expect(homeCategories.nth(2)).toContainText('正常使用');
  await expect(homeCategories.nth(2)).toContainText('50%');

  await page.getByRole('button', { name: '收支明細' }).first().click();
  await expect(page.locator('.transaction-row')).toHaveCount(8);
  await page.getByLabel('收支類型').selectOption('expense');
  await expect(page.locator('.transaction-row')).toHaveCount(6);
  await page.getByLabel('明細分類').selectOption({ label: '交通' });
  await expect(page.locator('.transaction-row')).toHaveCount(2);
  await page.getByLabel('搜尋明細').fill('捷運');
  await expect(page.locator('.transaction-row')).toHaveCount(1);
  await expect(page.locator('.transaction-row')).toContainText('捷運月票');
  await page.getByLabel('搜尋明細').fill('');
  await page.getByLabel('明細分類').selectOption('all');
  await page.getByLabel('收支類型').selectOption('all');
  await expect(page.locator('.transaction-row')).toHaveCount(8);

  await page.getByRole('button', { name: '月預算' }).first().click();
  const food = page.locator('[data-testid^="category-budget-"]').filter({ hasText: '餐飲' });
  const transport = page.locator('[data-testid^="category-budget-"]').filter({ hasText: '交通' });
  const living = page.locator('[data-testid^="category-budget-"]').filter({ hasText: '生活' });
  await expect(page.locator('.category-budget-item').nth(0)).toContainText('交通');
  await expect(page.locator('.category-budget-item').nth(1)).toContainText('生活');
  await expect(page.locator('.category-budget-item').nth(2)).toContainText('餐飲');
  await expect(food).toContainText('$4,000');
  await expect(food).toContainText('$2,000');
  await expect(food).toContainText('50%');
  await expect(transport).toContainText('$1,800');
  await expect(transport).toContainText('超支 · $300');
  await expect(transport).toContainText('120%');
  await expect(living).toContainText('$18,000');
  await expect(living).toContainText('$2,000');
  await expect(living).toContainText('90%');

  for (const pageKey of ['overview', 'records', 'budget', 'settings']) {
    await verifyViewport(page, pageKey, 2560, 1440, testInfo.outputPath(`local-acceptance-2560-${pageKey}.png`));
  }
  for (const pageKey of ['overview', 'records', 'budget', 'settings']) {
    await verifyViewport(page, pageKey, 1440, 900, testInfo.outputPath(`local-acceptance-1440-${pageKey}.png`));
  }
  for (const pageKey of ['overview', 'records', 'budget', 'settings']) {
    await verifyViewport(page, pageKey, 390, 844, testInfo.outputPath(`local-acceptance-390-${pageKey}.png`));
  }
});
