import type { Category, CategoryBudget, CategoryBudgetSummary, Transaction, TransactionFilter } from './types';

export interface MonthlySummary { income: number; expense: number; balance: number; budget: number; remaining: number; budgetUsedPercent: number }
export interface ConsumptionCategorySummary { categoryId: string; categoryName: string; amount: number; sharePercent: number }
export interface ConsumptionAnalysis { currentMonth: string; previousMonth: string; currentExpense: number; previousExpense: number; changeAmount: number; changePercent: number | null; categories: ConsumptionCategorySummary[] }
export interface MonthlyExpenseTrendPoint { month: string; amount: number }

export type BudgetStatus = 'normal' | 'near' | 'over';

export function getBudgetStatus(usedPercent: number | null, remaining: number): BudgetStatus {
  if (remaining < 0) return 'over';
  if (usedPercent !== null && usedPercent >= 80) return 'near';
  return 'normal';
}

export function calculateCategoryBudgetSummaries(budgets: CategoryBudget[], rows: Transaction[], month: string): CategoryBudgetSummary[] {
  return budgets.filter((budget) => budget.month === month).map((budget) => {
    const spent = rows.reduce((sum, row) => sum + (row.type === 'expense' && row.occurredOn.startsWith(month) && row.categoryId === budget.categoryId ? row.amount : 0), 0);
    return { ...budget, spent, remaining: budget.amount - spent, usedPercent: budget.amount > 0 ? Math.round(spent / budget.amount * 100) : null };
  });
}

export function prioritizeCategoryBudgetSummaries(summaries: CategoryBudgetSummary[], limit = 3): CategoryBudgetSummary[] {
  const urgency = (summary: CategoryBudgetSummary) => summary.remaining < 0 ? 0 : summary.usedPercent !== null && summary.usedPercent >= 80 ? 1 : 2;
  const usage = (summary: CategoryBudgetSummary) => summary.usedPercent ?? (summary.spent > 0 ? Number.POSITIVE_INFINITY : -1);
  return [...summaries]
    .sort((a, b) => urgency(a) - urgency(b) || usage(b) - usage(a) || a.categoryId.localeCompare(b.categoryId))
    .slice(0, Math.max(0, limit));
}

export function getPreviousMonth(month: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match || Number(match[1]) === 0) throw new RangeError('月份格式必須為 YYYY-MM');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber === 1) return `${String(year - 1).padStart(4, '0')}-12`;
  return `${match[1]}-${String(monthNumber - 1).padStart(2, '0')}`;
}

export function getRecentMonths(month: string, count = 6): string[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('月份數量必須為正整數');
  getPreviousMonth(month);
  const months = [month];
  while (months.length < count) months.unshift(getPreviousMonth(months[0]));
  return months;
}

export function calculateMonthlyExpenseTrend(rows: Transaction[], months: string[]): MonthlyExpenseTrendPoint[] {
  return months.map((month) => ({
    month,
    amount: rows.reduce((sum, row) => sum + (row.type === 'expense' && row.occurredOn.slice(0, 7) === month ? row.amount : 0), 0),
  }));
}

export function calculateConsumptionAnalysis(rows: Transaction[], categories: Category[], month: string) {
  const previousMonth = getPreviousMonth(month);
  const categoryNames = new Map(categories.filter((category) => category.type === 'expense').map((category) => [category.id, category.name]));
  const expenseRows = rows.filter((row) => row.type === 'expense');
  const sumMonth = (targetMonth: string) => expenseRows.reduce((sum, row) => sum + (row.occurredOn.slice(0, 7) === targetMonth ? row.amount : 0), 0);
  const currentExpense = sumMonth(month);
  const previousExpense = sumMonth(previousMonth);
  const changeAmount = currentExpense - previousExpense;
  const categoryTotals = new Map<string, { categoryName: string; amount: number }>();

  for (const row of expenseRows) {
    if (row.occurredOn.slice(0, 7) !== month) continue;
    const categoryName = categoryNames.get(row.categoryId) || row.categoryName || '未分類';
    const current = categoryTotals.get(row.categoryId);
    categoryTotals.set(row.categoryId, { categoryName, amount: (current?.amount ?? 0) + row.amount });
  }

  const rankedCategories = [...categoryTotals.entries()]
    .map(([categoryId, item]) => ({ categoryId, categoryName: item.categoryName, amount: item.amount, sharePercent: currentExpense > 0 ? Math.round(item.amount / currentExpense * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount || a.categoryName.localeCompare(b.categoryName, 'zh-TW'));

  return {
    currentMonth: month,
    previousMonth,
    currentExpense,
    previousExpense,
    changeAmount,
    changePercent: previousExpense > 0 ? Math.round(changeAmount / previousExpense * 100) : null,
    categories: rankedCategories,
  };
}

export function calculateMonthlySummary(rows: Transaction[], month: string, budget: number): MonthlySummary {
  const currentMonth = rows.filter((row) => row.occurredOn.slice(0, 7) === month);
  const income = currentMonth.reduce((sum, row) => sum + (row.type === 'income' ? row.amount : 0), 0);
  const expense = currentMonth.reduce((sum, row) => sum + (row.type === 'expense' ? row.amount : 0), 0);
  return { income, expense, balance: income - expense, budget, remaining: budget - expense, budgetUsedPercent: budget > 0 ? Math.round((expense / budget) * 100) : 0 };
}

export function filterTransactions(rows: Transaction[], filter: TransactionFilter): Transaction[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return rows.filter((row) => row.occurredOn.startsWith(filter.month)
    && (filter.type === 'all' || row.type === filter.type)
    && (filter.categoryId === 'all' || row.categoryId === filter.categoryId)
    && (!query || `${row.description} ${row.categoryName} ${row.paymentMethodName}`.toLocaleLowerCase().includes(query)))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id.localeCompare(a.id));
}

export function formatTwd(amount: number): string {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(amount);
}
