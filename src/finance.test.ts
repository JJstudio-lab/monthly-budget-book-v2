import { describe, expect, it } from 'vitest';
import { calculateCategoryBudgetSummaries, calculateConsumptionAnalysis, calculateMonthlyExpenseTrend, calculateMonthlySummary, filterTransactions, formatTwd, getBudgetStatus, getPreviousMonth, getRecentMonths, prioritizeCategoryBudgetSummaries } from './finance';
import type { Category, CategoryBudget, Transaction } from './types';

const rows: Transaction[] = [
  { id: '1', ledgerId: 'l1', amount: 1200, type: 'expense', occurredOn: '2025-04-02', description: '午餐', categoryId: 'food', categoryName: '餐飲', paymentMethodId: 'cash', paymentMethodName: '現金' },
  { id: '2', ledgerId: 'l1', amount: 50000, type: 'income', occurredOn: '2025-04-03', description: '薪資', categoryId: 'salary', categoryName: '薪資', paymentMethodId: 'bank', paymentMethodName: '銀行' },
  { id: '3', ledgerId: 'l1', amount: 800, type: 'expense', occurredOn: '2025-03-30', description: '咖啡', categoryId: 'food', categoryName: '餐飲', paymentMethodId: 'card', paymentMethodName: '信用卡' },
];

describe('budget usage status', () => {
  it('keeps normal use below 80 percent', () => {
    expect(getBudgetStatus(0, 1000)).toBe('normal');
    expect(getBudgetStatus(79, 210)).toBe('normal');
  });

  it('marks 80 through 100 percent as near without calling exact limit overspent', () => {
    expect(getBudgetStatus(80, 200)).toBe('near');
    expect(getBudgetStatus(100, 0)).toBe('near');
  });

  it('marks negative remaining as overspent even when a zero budget has no percentage', () => {
    expect(getBudgetStatus(120, -200)).toBe('over');
    expect(getBudgetStatus(null, -1)).toBe('over');
  });

  it('treats an unused zero budget as normal', () => {
    expect(getBudgetStatus(null, 0)).toBe('normal');
  });
});

describe('monthly finance calculations', () => {
  it('summarizes only the selected calendar month and computes remaining budget', () => {
    expect(calculateMonthlySummary(rows, '2025-04', 10000)).toEqual({ income: 50000, expense: 1200, balance: 48800, budget: 10000, remaining: 8800, budgetUsedPercent: 12 });
  });

  it('handles zero budgets without division errors', () => {
    expect(calculateMonthlySummary(rows, '2025-04', 0).budgetUsedPercent).toBe(0);
  });

  it('filters by query, date month, type and category together', () => {
    expect(filterTransactions(rows, { month: '2025-04', query: '午', type: 'expense', categoryId: 'food' }).map((row) => row.id)).toEqual(['1']);
  });

  it('formats amounts as Taiwanese dollars without fractional digits', () => {
    expect(formatTwd(1200)).toContain('1,200');
  });

  it('calculates category spending from same-month expenses only', () => {
    const budgets: CategoryBudget[] = [
      { month: '2025-04', categoryId: 'food', amount: 1000 },
      { month: '2025-04', categoryId: 'transport', amount: 0 },
      { month: '2025-03', categoryId: 'food', amount: 500 },
    ];
    const transactions = [
      ...rows,
      { ...rows[0], id: '4', amount: 200, occurredOn: '2025-04-04' },
      { ...rows[0], id: '5', amount: 500, categoryId: 'transport', occurredOn: '2025-04-05' },
      { ...rows[1], id: '6', amount: 900, categoryId: 'food', occurredOn: '2025-04-06' },
    ];

    expect(calculateCategoryBudgetSummaries(budgets, transactions, '2025-04')).toEqual([
      { month: '2025-04', categoryId: 'food', amount: 1000, spent: 1400, remaining: -400, usedPercent: 140 },
      { month: '2025-04', categoryId: 'transport', amount: 0, spent: 500, remaining: -500, usedPercent: null },
    ]);
  });

  it('prioritizes overspent and near-limit categories, then caps the homepage list', () => {
    const summaries = [
      { month: '2025-04', categoryId: 'normal', amount: 1000, spent: 600, remaining: 400, usedPercent: 60 },
      { month: '2025-04', categoryId: 'near', amount: 1000, spent: 850, remaining: 150, usedPercent: 85 },
      { month: '2025-04', categoryId: 'over', amount: 1000, spent: 1100, remaining: -100, usedPercent: 110 },
      { month: '2025-04', categoryId: 'zero-over', amount: 0, spent: 10, remaining: -10, usedPercent: null },
      { month: '2025-04', categoryId: 'empty', amount: 0, spent: 0, remaining: 0, usedPercent: null },
    ];

    expect(prioritizeCategoryBudgetSummaries(summaries, 3).map((item) => item.categoryId)).toEqual(['zero-over', 'over', 'near']);
    expect(prioritizeCategoryBudgetSummaries([])).toEqual([]);
  });
});

describe('consumption analysis', () => {
  const categories: Category[] = [
    { id: 'food', name: '餐飲', type: 'expense', sortOrder: 10, active: true },
    { id: 'transport', name: '交通', type: 'expense', sortOrder: 20, active: true },
    { id: 'salary', name: '薪資', type: 'income', sortOrder: 30, active: true },
  ];

  it('compares only monthly expenses and ranks categories by amount and share', () => {
    const analysisRows: Transaction[] = [
      { ...rows[0], id: 'a1', amount: 1200, occurredOn: '2025-04-02' },
      { ...rows[0], id: 'a2', amount: 800, occurredOn: '2025-04-05', categoryId: 'transport', categoryName: '交通' },
      { ...rows[1], id: 'a3', amount: 70000, occurredOn: '2025-04-06' },
      { ...rows[0], id: 'a4', amount: 1000, occurredOn: '2025-03-02' },
      { ...rows[1], id: 'a5', amount: 25000, occurredOn: '2025-03-03' },
      { ...rows[0], id: 'a6', amount: 900, occurredOn: '2025-02-12' },
    ];

    expect(calculateConsumptionAnalysis(analysisRows, categories, '2025-04')).toEqual({
      currentMonth: '2025-04',
      previousMonth: '2025-03',
      currentExpense: 2000,
      previousExpense: 1000,
      changeAmount: 1000,
      changePercent: 100,
      categories: [
        { categoryId: 'food', categoryName: '餐飲', amount: 1200, sharePercent: 60 },
        { categoryId: 'transport', categoryName: '交通', amount: 800, sharePercent: 40 },
      ],
    });
  });

  it('handles a zero-spend comparison without dividing by zero', () => {
    const result = calculateConsumptionAnalysis([], categories, '2025-04');
    expect(result.currentExpense).toBe(0);
    expect(result.previousExpense).toBe(0);
    expect(result.changeAmount).toBe(0);
    expect(result.changePercent).toBeNull();
    expect(result.categories).toEqual([]);
  });

  it('finds the prior month across a year boundary', () => {
    expect(getPreviousMonth('2025-01')).toBe('2024-12');
  });
});

describe('monthly expense trend', () => {
  it('returns six chronological months including the selected month across a year boundary', () => {
    expect(getRecentMonths('2025-02')).toEqual(['2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02']);
  });

  it('totals only expenses for each requested month and keeps zero-spend months', () => {
    const trendRows: Transaction[] = [
      { ...rows[0], id: 'trend-1', amount: 1200, occurredOn: '2025-04-02' },
      { ...rows[0], id: 'trend-2', amount: 800, occurredOn: '2025-04-20' },
      { ...rows[1], id: 'trend-3', amount: 50000, occurredOn: '2025-04-03' },
      { ...rows[0], id: 'trend-4', amount: 700, occurredOn: '2025-02-10' },
      { ...rows[0], id: 'trend-5', amount: 900, occurredOn: '2024-10-12' },
    ];
    const months = ['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'];

    expect(calculateMonthlyExpenseTrend(trendRows, months)).toEqual([
      { month: '2024-10', amount: 900 },
      { month: '2024-11', amount: 0 },
      { month: '2024-12', amount: 0 },
      { month: '2025-01', amount: 0 },
      { month: '2025-02', amount: 700 },
      { month: '2025-03', amount: 0 },
    ]);
  });
});
