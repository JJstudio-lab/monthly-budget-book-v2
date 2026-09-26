import { expect, test } from '@playwright/test';

const password = 'Local-only-E2E-Password-2468';
const viewports = [
  { name: 'desktop-2560x1440', width: 2560, height: 1440 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];
const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

for (const viewport of viewports) {
  test(`transaction create, edit, cancel, validation, and delete UX at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    const id = unique();
    const email = `transaction-ux-${id}@example.test`;
    const ledgerName = `Transaction UX ${id}`;
    await page.getByRole('button', { name: '建立帳號' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('密碼').fill(password);
    await page.locator('form').getByRole('button', { name: '建立帳號' }).click();
    await expect(page.getByRole('button', { name: '建立我的帳本' })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept(ledgerName));
    await page.getByRole('button', { name: '建立我的帳本' }).click();
    await expect(page.getByRole('heading', { name: '收支總覽' })).toBeVisible();

    const expenseDescription = `Transit pass ${id}`;
    const incomeDescription = `Salary ${id}`;
    const editedDescription = `Edited transit ${id}`;
    await page.getByRole('button', { name: '新增明細' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const amount = page.getByLabel('金額');
    const date = page.getByLabel('日期');
    const category = page.getByLabel('分類');
    const paymentMethod = page.getByLabel('付款方式');
    const today = await date.inputValue();

    await expect(dialog.getByRole('button', { name: '支出', exact: true })).toHaveClass(/selected/);
    await expect(category.locator('option')).toHaveCount(3);
    await expect(paymentMethod.locator('option')).toHaveCount(3);
    await expect(date).toHaveValue(today);
    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
    await page.screenshot({ path: testInfo.outputPath('transaction-dialog.png') });

    await dialog.getByRole('button', { name: '新增明細' }).click();
    await expect.poll(() => amount.evaluate((element) => (element as HTMLInputElement).validationMessage)).not.toBe('');
    await expect(dialog).toBeVisible();
    await amount.fill('360');
    await date.fill(today);
    await category.selectOption({ label: '交通' });
    await paymentMethod.selectOption({ label: '信用卡' });
    await page.getByLabel('備註').fill(expenseDescription);
    await dialog.getByRole('button', { name: '新增明細' }).click();
    await expect(page.getByRole('status')).toContainText('明細已新增');

    await page.getByRole('button', { name: '收支明細' }).first().click();
    const rows = page.locator('.transaction-row');
    await expect(rows).toHaveCount(1);
    const expenseRow = rows.filter({ hasText: expenseDescription });
    await expect(expenseRow).toContainText('交通');
    await expect(expenseRow).toContainText('信用卡');
    await expect(expenseRow).toContainText('360');

    await page.getByRole('button', { name: '新增明細' }).first().click();
    const incomeDialog = page.getByRole('dialog');
    await incomeDialog.getByRole('button', { name: '收入', exact: true }).click();
    await expect(incomeDialog.getByRole('button', { name: '收入', exact: true })).toHaveClass(/selected/);
    await incomeDialog.getByLabel('金額').fill('68000');
    await incomeDialog.getByLabel('分類').selectOption({ label: '薪資' });
    await incomeDialog.getByLabel('付款方式').selectOption({ label: '轉帳' });
    await incomeDialog.getByLabel('備註').fill(incomeDescription);
    await incomeDialog.getByRole('button', { name: '新增明細' }).click();
    await expect(page.getByRole('status')).toContainText('明細已新增');
    await expect(rows).toHaveCount(2);
    const incomeRow = rows.filter({ hasText: incomeDescription });
    await expect(incomeRow).toContainText('薪資');
    await expect(incomeRow).toContainText('轉帳');
    await expect(incomeRow).toContainText('68,000');

    await page.getByRole('button', { name: `編輯 ${expenseDescription}` }).click();
    const editDialog = page.getByRole('dialog');
    await expect(editDialog.getByLabel('金額')).toHaveValue('360');
    await expect(editDialog.getByLabel('日期')).toHaveValue(today);
    await expect(editDialog.getByLabel('分類').locator('option:checked')).toHaveText('交通');
    await expect(editDialog.getByLabel('付款方式').locator('option:checked')).toHaveText('信用卡');
    await expect(editDialog.getByLabel('備註')).toHaveValue(expenseDescription);
    const editedDate = `${today.slice(0, 8)}${today.endsWith('-01') ? '02' : '01'}`;
    await editDialog.getByLabel('金額').fill('420');
    await editDialog.getByLabel('日期').fill(editedDate);
    await editDialog.getByLabel('分類').selectOption({ label: '生活' });
    await editDialog.getByLabel('付款方式').selectOption({ label: '現金' });
    await editDialog.getByLabel('備註').fill(editedDescription);
    await editDialog.getByRole('button', { name: '儲存變更' }).click();
    await expect(page.getByRole('status')).toContainText('明細已更新');
    await expect(rows).toHaveCount(2);
    const editedRow = rows.filter({ hasText: editedDescription });
    await expect(editedRow).toContainText('生活');
    await expect(editedRow).toContainText('現金');
    await expect(editedRow).toContainText(editedDate);
    await expect(editedRow).toContainText('420');
    await expect(rows.filter({ hasText: expenseDescription })).toHaveCount(0);

    await page.getByRole('button', { name: `編輯 ${editedDescription}` }).click();
    const cancelEditDialog = page.getByRole('dialog');
    await cancelEditDialog.getByLabel('金額').fill('999');
    await cancelEditDialog.getByLabel('備註').fill(`Discarded edit ${id}`);
    await cancelEditDialog.getByRole('button', { name: '取消' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(editedRow).toContainText('420');
    await expect(rows.filter({ hasText: `Discarded edit ${id}` })).toHaveCount(0);

    await page.getByRole('button', { name: '新增明細' }).first().click();
    const cancelAddDialog = page.getByRole('dialog');
    await cancelAddDialog.getByLabel('金額').fill('100');
    await cancelAddDialog.getByLabel('備註').fill(`Canceled add ${id}`);
    await cancelAddDialog.getByRole('button', { name: '取消' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: `Canceled add ${id}` })).toHaveCount(0);

    page.once('dialog', (confirm) => confirm.dismiss());
    await editedRow.getByRole('button', { name: `刪除 ${editedDescription}` }).click();
    await expect(editedRow).toBeVisible();
    page.once('dialog', (confirm) => confirm.accept());
    await editedRow.getByRole('button', { name: `刪除 ${editedDescription}` }).click();
    await expect(page.getByRole('status')).toContainText('明細已刪除');
    await expect(rows).toHaveCount(1);
    await expect(rows.filter({ hasText: incomeDescription })).toBeVisible();
    const finalWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(finalWidth).toBe(viewport.width);
  });
}
