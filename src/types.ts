export type TransactionType = 'income' | 'expense';
export type CategoryKind = TransactionType;
export type LedgerRole = 'owner' | 'editor' | 'viewer';
export type MemberRole = Exclude<LedgerRole, 'owner'>;

export interface LedgerMember { userId: string; email: string; displayName: string; role: LedgerRole; joinedAt: string }
export interface LedgerInvitation { id: string; email: string; role: MemberRole; createdAt: string; expiresAt: string }
export interface CreatedLedgerInvitation { id: string; token: string; expiresAt: string }


export interface Transaction {
  id: string;
  ledgerId: string;
  amount: number;
  type: TransactionType;
  occurredOn: string;
  description: string;
  categoryId: string;
  categoryName: string;
  paymentMethodId: string;
  paymentMethodName: string;
}

export interface Ledger { id: string; name: string; currency: 'TWD'; role: LedgerRole }
export interface Category { id: string; name: string; type: CategoryKind; sortOrder: number; active: boolean }
export interface PaymentMethod { id: string; name: string; sortOrder: number; active: boolean }
export interface Budget { month: string; amount: number }
export interface CategoryBudget { month: string; categoryId: string; amount: number }
export interface CategoryBudgetSummary extends CategoryBudget { spent: number; remaining: number; usedPercent: number | null }
export interface TransactionFilter { month: string; query: string; type: TransactionType | 'all'; categoryId: string | 'all' }
