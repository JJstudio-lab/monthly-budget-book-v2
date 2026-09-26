import { expect, test, type Browser, type Page } from '@playwright/test';

const password = 'Local-only-E2E-Password-2468';
const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function signUp(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '建立帳號' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('密碼').fill(password);
  await page.locator('form').getByRole('button', { name: '建立帳號' }).click();
}

async function createOwnerLedger(browser: Browser, email: string, ledgerName: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUp(page, email);
  page.once('dialog', (dialog) => dialog.accept(ledgerName));
  await page.getByRole('button', { name: '建立我的帳本' }).click();
  await expect(page.getByRole('heading', { name: '收支總覽' })).toBeVisible();
  await page.getByRole('button', { name: '帳本設定' }).first().click();
  return { context, page };
}

async function createInvitation(page: Page, email: string, role: 'editor' | 'viewer') {
  await page.getByLabel('邀請 Email').fill(email);
  await page.getByLabel('邀請權限').selectOption(role);
  await page.getByRole('button', { name: '建立邀請' }).click();
  await expect(page.getByRole('status')).toContainText('邀請已建立');
  return page.getByLabel('共用邀請連結').inputValue();
}

async function addExpenseCategory(page: Page, name: string) {
  const panel = page.locator('.config-panel').first();
  await panel.getByLabel('新增收支分類').fill(name);
  await panel.getByRole('button', { name: '新增' }).click();
  await expect(panel.getByLabel(`編輯名稱 ${name}`)).toBeVisible();
}

async function addExpense(page: Page, category: string, amount: string, description: string) {
  await page.getByRole('button', { name: '新增明細' }).first().click();
  await page.getByLabel('金額').fill(amount);
  await page.getByLabel('分類').selectOption({ label: category });
  await page.getByLabel('備註').fill(description);
  await page.locator('[role="dialog"]').getByRole('button', { name: '新增明細' }).click();
  await expect(page.getByRole('status')).toContainText('明細已新增');
}

test('two synthetic users share transactions, categories, and budgets with role-bound access', async ({ browser }) => {
  test.setTimeout(90_000);
  const id = unique();
  const ownerEmail = `owner-${id}@example.test`;
  const memberEmail = `member-${id}@example.test`;
  const ledgerName = `Shared E2E ${id}`;
  const sharedCategory = `Shared category ${id}`;
  const memberCategory = `Member category ${id}`;
  const sharedTransaction = `Owner transaction ${id}`;
  const memberTransaction = `Member transaction ${id}`;
  const owner = await createOwnerLedger(browser, ownerEmail, ledgerName);

  await addExpenseCategory(owner.page, sharedCategory);
  await owner.page.getByRole('button', { name: '總覽' }).first().click();
  await addExpense(owner.page, sharedCategory, '350', sharedTransaction);
  await owner.page.getByRole('button', { name: '月預算' }).first().click();
  await owner.page.getByLabel('本月預算金額').fill('5000');
  await owner.page.getByRole('button', { name: '儲存預算' }).click();
  await expect(owner.page.getByRole('status')).toContainText('預算已儲存');
  await owner.page.getByLabel('預算分類').selectOption({ label: sharedCategory });
  await owner.page.getByLabel('分類預算金額', { exact: true }).fill('700');
  await owner.page.getByRole('button', { name: '新增分類預算' }).click();
  const ownerCategoryBudget = owner.page.locator('.category-budget-item').filter({ hasText: sharedCategory });
  await expect(ownerCategoryBudget).toContainText('700');
  await expect(ownerCategoryBudget).toContainText('350');

  const outsiderEmail = `outsider-${id}@example.test`;
  const outsiderContext = await browser.newContext();
  const outsiderPage = await outsiderContext.newPage();
  await signUp(outsiderPage, outsiderEmail);
  await expect(outsiderPage.getByText('尚未建立帳本')).toBeVisible();
  await expect(outsiderPage.getByRole('combobox', { name: '選擇帳本' }).locator('option')).toHaveCount(0);

  await owner.page.getByRole('button', { name: '帳本設定' }).first().click();
  const invitationUrl = await createInvitation(owner.page, memberEmail, 'editor');
  expect(new URL(invitationUrl).searchParams.get('invite')).toMatch(/^[0-9a-f]{64}$/);

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(invitationUrl);
  await memberPage.getByRole('button', { name: '建立帳號' }).click();
  await memberPage.getByLabel('Email').fill(memberEmail);
  await memberPage.getByLabel('密碼').fill(password);
  await memberPage.locator('form').getByRole('button', { name: '建立帳號' }).click();
  await expect(memberPage.getByRole('heading', { name: '收支總覽' })).toBeVisible();
  const ledgerSelect = memberPage.getByRole('combobox', { name: '選擇帳本' });
  await expect(ledgerSelect.locator('option')).toHaveCount(1);
  await expect.poll(() => ledgerSelect.evaluate((element) => (element as HTMLSelectElement).selectedOptions[0]?.textContent)).toBe(ledgerName);
  const memberHomepageBudget = memberPage.locator('.budget-panel');
  await expect(memberHomepageBudget).toContainText('$5,000');
  await expect(memberHomepageBudget).toContainText('$350');
  await expect(memberHomepageBudget).toContainText(sharedCategory);
  await memberPage.getByRole('button', { name: '收支明細' }).first().click();
  await expect(memberPage.locator('.transaction-row')).toContainText(sharedTransaction);

  await memberPage.getByRole('button', { name: '帳本設定' }).first().click();
  await expect(memberPage.getByLabel(`編輯名稱 ${sharedCategory}`)).toBeVisible();
  await addExpenseCategory(memberPage, memberCategory);
  await memberPage.getByRole('button', { name: '總覽' }).first().click();
  await addExpense(memberPage, memberCategory, '125', memberTransaction);
  await memberPage.getByRole('button', { name: '月預算' }).first().click();
  await expect(memberPage.getByLabel('本月預算金額')).toHaveValue('5000');
  await expect(memberPage.locator('.category-budget-item').filter({ hasText: sharedCategory })).toContainText('700');
  await memberPage.getByLabel('預算分類').selectOption({ label: memberCategory });
  await memberPage.getByLabel('分類預算金額', { exact: true }).fill('300');
  await memberPage.getByRole('button', { name: '新增分類預算' }).click();
  await expect(memberPage.locator('.category-budget-item').filter({ hasText: memberCategory })).toContainText('300');

  await owner.page.reload();
  await expect(owner.page.locator('.budget-panel')).toContainText('$475');
  await expect(owner.page.locator('.budget-panel')).toContainText(memberCategory);
  await owner.page.getByRole('button', { name: '帳本設定' }).first().click();
  await expect(owner.page.getByLabel(`編輯名稱 ${memberCategory}`)).toBeVisible();
  await owner.page.getByRole('button', { name: '月預算' }).first().click();
  await expect(owner.page.locator('.category-budget-item').filter({ hasText: memberCategory })).toContainText('300');

  await outsiderPage.reload();
  await expect(outsiderPage.getByText('尚未建立帳本')).toBeVisible();
  await expect(outsiderPage.getByRole('combobox', { name: '選擇帳本' }).locator('option')).toHaveCount(0);

  await owner.page.reload();
  await owner.page.getByRole('button', { name: '帳本設定' }).first().click();
  await expect(owner.page.getByText(memberEmail)).toBeVisible();
  await owner.page.getByLabel(`成員權限 ${memberEmail}`).selectOption('viewer');
  await expect(owner.page.getByRole('status')).toContainText('成員權限已更新');

  await memberPage.reload();
  await memberPage.getByRole('button', { name: '帳本設定' }).first().click();
  await expect(memberPage.locator('.ledger-info .role-pill')).toHaveText('檢視者');
  await expect(memberPage.getByRole('button', { name: /建立邀請/ })).toHaveCount(0);

  owner.page.once('dialog', (dialog) => dialog.accept());
  await owner.page.getByRole('button', { name: `移除成員 ${memberEmail}` }).click();
  await expect(owner.page.getByText(memberEmail)).toHaveCount(0);
  await memberPage.reload();
  await expect(memberPage.getByText('尚未建立帳本')).toBeVisible();
  await expect(memberPage.getByRole('combobox', { name: '選擇帳本' }).locator('option')).toHaveCount(0);

  await memberContext.close();
  await outsiderContext.close();
  await owner.context.close();
});

test('owner can revoke an invitation before it is accepted', async ({ browser }) => {
  const id = unique();
  const owner = await createOwnerLedger(browser, `owner-${id}@example.test`, `Revocation E2E ${id}`);
  const inviteeEmail = `revoked-${id}@example.test`;
  const invitationUrl = await createInvitation(owner.page, inviteeEmail, 'viewer');
  owner.page.once('dialog', (dialog) => dialog.accept());
  await owner.page.getByRole('button', { name: `撤銷邀請 ${inviteeEmail}` }).click();
  await expect(owner.page.getByText(inviteeEmail)).toHaveCount(0);

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(invitationUrl);
  await inviteePage.getByRole('button', { name: '建立帳號' }).click();
  await inviteePage.getByLabel('Email').fill(inviteeEmail);
  await inviteePage.getByLabel('密碼').fill(password);
  await inviteePage.locator('form').getByRole('button', { name: '建立帳號' }).click();
  await expect(inviteePage.getByRole('status')).toContainText(/invalid or expired invitation/i);
  await expect(inviteePage.getByText('尚未建立帳本')).toBeVisible();

  await inviteeContext.close();
  await owner.context.close();
});
