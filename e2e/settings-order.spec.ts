import { expect, test } from '@playwright/test';

const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'Local-only-order-E2E-Password-2468';

async function itemNames(page: import('@playwright/test').Page, panelIndex = 0) {
  return page.locator('.config-panel').nth(panelIndex).locator('.config-item input[aria-label^="編輯名稱"]').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  );
}

test('settings reorder buttons respect boundaries and persist order after reload on desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '建立帳號' }).click();
  await page.getByLabel('Email').fill(`settings-order-${id}@example.test`);
  await page.getByLabel('密碼').fill(password);
  await page.locator('form').getByRole('button', { name: '建立帳號' }).click();
  page.once('dialog', (dialog) => dialog.accept('排序驗收合成帳本'));
  await page.getByRole('button', { name: '建立我的帳本' }).click();
  await expect(page.getByRole('heading', { name: '收支總覽' })).toBeVisible();
  await page.getByRole('button', { name: '帳本設定' }).first().click();

  const categories = page.locator('.config-panel').first().locator('.config-item');
  const namesBefore = await itemNames(page);
  expect(namesBefore.length).toBeGreaterThan(1);
  await expect(categories.first().getByRole('button', { name: new RegExp(`上移 ${namesBefore[0]}`) })).toBeDisabled();
  await expect(categories.last().getByRole('button', { name: new RegExp(`下移 ${namesBefore.at(-1)}`) })).toBeDisabled();
  await expect(page.locator('.config-item input[type="number"]')).toHaveCount(0);
  await categories.nth(1).getByRole('button', { name: `上移 ${namesBefore[1]}` }).click();
  const expectedOrder = [namesBefore[1], namesBefore[0], ...namesBefore.slice(2)];
  await expect.poll(() => itemNames(page)).toEqual(expectedOrder);
  const namesAfterMove = await itemNames(page);
  const methods = page.locator('.config-panel').nth(1).locator('.config-item');
  const methodsBefore = await itemNames(page, 1);
  await expect(methods.first().getByRole('button', { name: `上移 ${methodsBefore[0]}` })).toBeDisabled();
  await expect(methods.last().getByRole('button', { name: `下移 ${methodsBefore.at(-1)}` })).toBeDisabled();
  await methods.nth(1).getByRole('button', { name: `上移 ${methodsBefore[1]}` }).click();
  const expectedMethods = [methodsBefore[1], methodsBefore[0], ...methodsBefore.slice(2)];
  await expect.poll(() => itemNames(page, 1)).toEqual(expectedMethods);

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const moveButton = page.locator('.config-panel').first().locator('.config-item').nth(1).getByRole('button', { name: `下移 ${namesAfterMove[1]}` });
    const box = await moveButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  }

  await page.reload();
  await expect(page.getByRole('heading', { name: '收支總覽' })).toBeVisible();
  await page.getByRole('button', { name: '帳本設定' }).first().click();
  expect(await itemNames(page)).toEqual(namesAfterMove);
  expect(await itemNames(page, 1)).toEqual(expectedMethods);
});
