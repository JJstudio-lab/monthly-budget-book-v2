import type { CategoryBudget, CategoryBudgetSummary, Transaction, TransactionFilter } from './types';

export interface MonthlySummary { income: number; expense: number; balance: number; budget: number; remaining: number; budgetUsedPercent: number }

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
