import { expect, test, type Page } from '@playwright/test';

const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Local-E2E-${unique()}-Password!`;

type FixtureRow = { seq: number; description: string; type: 'income' | 'expense'; category: string; payment: string; amount: number; date: string };

function fixtureRows(id: string, month: string, monthOffset: number, count: number, currentDay: number): FixtureRow[] {
  const monthDate = new Date(`${month}-01T00:00:00.000Z`);
  monthDate.setUTCMonth(monthDate.getUTCMonth() - monthOffset);
  const rowMonth = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
  return Array.from({ length: count }, (_, index) => {
    const seq = index + 1;
    const type = seq % 5 === 0 ? 'income' : 'expense';
    const category = type === 'income'
      ? (seq % 2 === 0 ? '薪資' : '其他收入')
      : (seq % 3 === 0 ? '餐飲' : seq % 3 === 1 ? '交通' : '生活');
    const day = (seq - 1) % (monthOffset === 0 ? currentDay : 28) + 1;
    return {
      seq,
      description: `${monthOffset === 0 ? 'M0' : 'M1'}-${String(seq).padStart(2, '0')}`,
      type,
      category,
      payment: seq % 3 === 0 ? '現金' : seq % 3 === 1 ? '信用卡' : '轉帳',
      amount: 100 + (seq * 137) % 9000,
      date: `${rowMonth}-${String(day).padStart(2, '0')}`,
    };
  });
}

async function addFixtureTransaction(page: Page, row: FixtureRow) {
  await page.getByRole('button', { name: '新增明細' }).first().click();
  const dialog = page.getByRole('dialog');
  if (row.type === 'income') await dialog.getByRole('button', { name: '收入', exact: true }).click();
  await dialog.getByLabel('金額').fill(String(row.amount));
  await dialog.getByLabel('日期').fill(row.date);
  await dialog.getByLabel('分類').selectOption({ label: row.category });
  await dialog.getByLabel('付款方式').selectOption({ label: row.payment });
  await dialog.getByLabel('備註').fill(row.description);
  await dialog.getByRole('button', { name: '新增明細' }).click();
  await expect(page.getByRole('status')).toContainText('明細已新增');
}

async function readLayout(page: Page, width: number, height: number, screenshotPath: string) {
  await page.setViewportSize({ width, height });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.records-panel')!.getBoundingClientRect();
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      panelLeft: panel.left,
      panelRight: panel.right,
    };
  });
  expect(layout.documentWidth).toBe(width);
  expect(layout.panelLeft).toBeGreaterThanOrEqual(0);
  expect(layout.panelRight).toBeLessThanOrEqual(width);
  await page.screenshot({ path: screenshotPath });
}

test('dense Local transaction list supports scanning, search, filters, month switching, and discreet actions', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/');

  const id = unique();
  const email = `transaction-list-${id}@example.test`;
  const ledgerName = `List UX ${id}`;
  await page.getByRole('button', { name: '建立帳號' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('密碼').fill(password);
  await page.locator('form').getByRole('button', { name: '建立帳號' }).click();
  await expect(page.getByRole('button', { name: '建立我的帳本' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept(ledgerName));
  await page.getByRole('button', { name: '建立我的帳本' }).click();
  await expect(page.getByRole('heading', { name: '收支總覽' })).toBeVisible();

  const monthInput = page.getByLabel('選擇月份');
  const currentMonth = await monthInput.inputValue();
  const currentDay = Number(await page.evaluate(() => new Date().toISOString().slice(8, 10)));
  const previousDate = new Date(`${currentMonth}-01T00:00:00.000Z`);
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousMonth = previousDate.toISOString().slice(0, 7);
  const currentFixtures = fixtureRows(id, currentMonth, 0, 36, currentDay);
  const previousFixtures = fixtureRows(id, currentMonth, 1, 12, currentDay);

  for (const row of [...currentFixtures, ...previousFixtures]) await addFixtureTransaction(page, row);

  await page.getByRole('button', { name: '收支明細' }).first().click();
  const rows = page.locator('.transaction-row');
  await expect(rows).toHaveCount(36);

  const sampleExpense = currentFixtures[0];
  const expenseRow = rows.filter({ hasText: sampleExpense.description });
  await expect(expenseRow).toContainText('交通');
  await expect(expenseRow).toContainText('信用卡');
  await expect(expenseRow).toContainText(String(sampleExpense.amount));
  await expect(expenseRow).toContainText(sampleExpense.date);
  await expect(expenseRow.locator('.tx-icon')).toHaveClass(/expense/);
  await expect(expenseRow.locator('strong')).toHaveClass(/expense-text/);
  const sampleIncome = currentFixtures.find((row) => row.type === 'income')!;
  const incomeRow = rows.filter({ hasText: sampleIncome.description });
  await expect(incomeRow).toContainText(sampleIncome.category);
  await expect(incomeRow).toContainText(sampleIncome.payment);
  await expect(incomeRow).toContainText(sampleIncome.date);
  await expect(incomeRow.locator('.tx-icon')).toHaveClass(/income/);
  await expect(incomeRow.locator('strong')).toHaveClass(/income-text/);

  const rowDates = (await page.locator('.transaction-row .tx-main small').allTextContents()).map((text) => text.split('・')[0]);
  expect(rowDates).toEqual([...rowDates].sort((a, b) => b.localeCompare(a)));

  const search = page.getByLabel('搜尋明細');
  const typeFilter = page.getByLabel('收支類型');
  const categoryFilter = page.getByLabel('明細分類');
  const expectedCardCount = currentFixtures.filter((row) => row.payment === '信用卡').length;
  const expectedFoodCount = currentFixtures.filter((row) => row.category === '餐飲').length;
  const expectedIncomeCount = currentFixtures.filter((row) => row.type === 'income').length;

  await search.fill('信用卡');
  await expect(rows).toHaveCount(expectedCardCount);
  await search.fill('');
  await categoryFilter.selectOption({ label: '餐飲' });
  await expect(rows).toHaveCount(expectedFoodCount);
  await typeFilter.selectOption('expense');
  await expect(rows).toHaveCount(expectedFoodCount);
  await typeFilter.selectOption('income');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('還沒有符合條件的明細')).toBeVisible();
  await categoryFilter.selectOption('all');
  await expect(rows).toHaveCount(expectedIncomeCount);
  await typeFilter.selectOption('all');
  await search.fill('M0-01');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(sampleExpense.description);
  await search.fill('');

  await monthInput.fill(previousMonth);
  await expect(monthInput).toHaveValue(previousMonth);
  await expect(rows).toHaveCount(12);
  const expectedPreviousIncomeCount = previousFixtures.filter((row) => row.type === 'income').length;
  await typeFilter.selectOption('income');
  await expect(rows).toHaveCount(expectedPreviousIncomeCount);
  await typeFilter.selectOption('all');
  await search.fill('M1-01');
  await expect(rows).toHaveCount(1);
  await search.fill('');
  await monthInput.fill(currentMonth);
  await expect(monthInput).toHaveValue(currentMonth);
  await expect(rows).toHaveCount(36);

  await readLayout(page, 2560, 1440, testInfo.outputPath('transaction-list-2560x1440.png'));
  const actionDescription = `M0-${String(currentDay).padStart(2, '0')}`;
  const actionRow = rows.filter({ hasText: actionDescription });
  const actions = actionRow.locator('.row-actions');
  await expect(actions).toHaveCSS('opacity', '0');
  await actionRow.hover();
  await expect(actions).toHaveCSS('opacity', '1');
  await expect(actionRow.getByRole('button', { name: `編輯 ${actionDescription}` })).toBeVisible();
  await expect(actionRow.getByRole('button', { name: `刪除 ${actionDescription}` })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('transaction-list-actions-2560x1440.png') });
  await actionRow.getByRole('button', { name: `編輯 ${actionDescription}` }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: '編輯明細' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  page.once('dialog', (confirm) => confirm.dismiss());
  await actionRow.getByRole('button', { name: `刪除 ${actionDescription}` }).click();
  await expect(actionRow).toBeVisible();

  await readLayout(page, 1440, 900, testInfo.outputPath('transaction-list-1440x900.png'));
  await expect(page.getByLabel('搜尋明細')).toBeVisible();
  await expect(page.getByLabel('收支類型')).toBeVisible();
  await expect(page.getByLabel('明細分類')).toBeVisible();

  await readLayout(page, 390, 844, testInfo.outputPath('transaction-list-390x844.png'));
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByLabel('搜尋明細')).toBeVisible();
  await expect(page.getByLabel('收支類型')).toBeVisible();
  await expect(page.getByLabel('明細分類')).toBeVisible();
  await expect(rows).toHaveCount(36);
  const mobileActionRow = rows.filter({ hasText: actionDescription });
  await expect(mobileActionRow.locator('.row-actions')).toHaveCSS('opacity', '1');
  await expect(mobileActionRow.getByRole('button', { name: `編輯 ${actionDescription}` })).toBeVisible();
  await expect(mobileActionRow.getByRole('button', { name: `刪除 ${actionDescription}` })).toBeVisible();
  const mobileActionTargets = await mobileActionRow.locator('.row-actions button').evaluateAll((buttons) => buttons.map((button) => {
    const bounds = button.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  }));
  expect(mobileActionTargets).toHaveLength(2);
  for (const target of mobileActionTargets) {
    expect(target.width).toBeGreaterThanOrEqual(32);
    expect(target.height).toBeGreaterThanOrEqual(32);
  }

  await search.fill('信用卡');
  await expect(rows).toHaveCount(expectedCardCount);
  await search.fill('');
  await typeFilter.selectOption('income');
  await expect(rows).toHaveCount(expectedIncomeCount);
  await typeFilter.selectOption('all');
  await expect(rows).toHaveCount(36);
});
